import { after, NextResponse } from 'next/server';

import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { MAX_RECEIPT_BYTES, RECEIPT_BUCKET, RECEIPT_EXTENSION, isReceiptPath, sniffReceiptType } from '@/lib/finance/receipt-files';

import type { NextRequest } from 'next/server';

// Expense receipt uploads (migration 0053). Browsers can't write to the
// private expense-receipts bucket; every file comes through here, where the
// session (an active manager or operator), the size and the file's actual
// bytes are checked before it is stored — with the service role, in the
// caller's own folder. Attaching it to an expense is a separate,
// database-checked step (save_expense / set_expense_receipts); a file that
// is never attached is removed by DELETE below or, if the form was simply
// abandoned, by the clean-up after a later upload.

const STAFF = ['manager', 'operator'];
// Unattached uploads older than this are someone's abandoned form.
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

const staffProfile = async () => {
  const profile = await getCurrentProfile();
  return profile && profile.active && STAFF.includes(profile.role) ? profile : null;
};

// Paths (of the given ones) attached to an expense.
const attachedPaths = async (paths: string[]) => {
  if (paths.length === 0) return new Set<string>();
  const { data, error } = await createAdminClient().from('expense_receipt_files').select('storage_path').in('storage_path', paths);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.storage_path as string));
};

// Best effort, after the response: the caller's own unattached uploads
// from more than a day ago.
const removeAbandoned = async (folder: string) => {
  try {
    const admin = createAdminClient();
    const { data: objects, error } = await admin.storage.from(RECEIPT_BUCKET).list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'asc' } });
    if (error || !objects) return;
    const cutoff = Date.now() - ABANDONED_AFTER_MS;
    const old = objects
      .filter((o) => o.id && o.created_at && new Date(o.created_at).getTime() < cutoff)
      .map((o) => `${folder}/${o.name}`);
    const attached = await attachedPaths(old);
    const stale = old.filter((path) => !attached.has(path));
    if (stale.length > 0) await admin.storage.from(RECEIPT_BUCKET).remove(stale);
  } catch (error) {
    console.error('Receipt clean-up failed', error instanceof Error ? error.message : error);
  }
};

export const POST = async (request: NextRequest) => {
  const profile = await staffProfile();
  if (!profile) return json({ error: 'errors.forbidden' }, 403);
  if (!(await checkRateLimit('receiptUploadPerUser', profile.id))) return json({ error: 'errors.rateLimited' }, 429);

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return json({ error: 'finance.expenses.form.receiptFailed' }, 400);
  }
  if (!(file instanceof File) || file.size === 0) return json({ error: 'finance.expenses.form.receiptType' }, 400);
  if (file.size > MAX_RECEIPT_BYTES) return json({ error: 'finance.expenses.form.receiptSize' }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  // The bytes decide, not the name or the browser's claim.
  const type = sniffReceiptType(bytes);
  if (!type) return json({ error: 'finance.expenses.form.receiptType' }, 415);

  const path = `${profile.id}/receipt-${crypto.randomUUID()}.${RECEIPT_EXTENSION[type]}`;
  const { error } = await createAdminClient().storage.from(RECEIPT_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (error) {
    console.error('Receipt upload failed', error.message);
    return json({ error: 'finance.expenses.form.receiptFailed' }, 502);
  }

  after(() => removeAbandoned(profile.id));
  return json({ path, contentType: type, size: bytes.length }, 201);
};

// Removes the caller's own upload that isn't attached to any expense (a
// picture taken off the form before saving). Attached receipts are only
// taken off by saving the expense.
export const DELETE = async (request: NextRequest) => {
  const profile = await staffProfile();
  if (!profile) return json({ error: 'errors.forbidden' }, 403);
  const path = request.nextUrl.searchParams.get('path');
  if (!isReceiptPath(path) || path.split('/')[0] !== profile.id) return json({ error: 'errors.notFound' }, 404);

  try {
    if ((await attachedPaths([path])).has(path)) return json({ error: 'finance.expenses.form.receiptInUse' }, 409);
    const { error } = await createAdminClient().storage.from(RECEIPT_BUCKET).remove([path]);
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error('Receipt removal failed', error instanceof Error ? error.message : error);
    return json({ error: 'finance.expenses.form.receiptRemoveFailed' }, 502);
  }
  return new NextResponse(null, { status: 204 });
};
