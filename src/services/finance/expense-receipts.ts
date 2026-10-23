import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { RECEIPT_BUCKET } from '@/lib/finance/receipt-files';

import type { ExpenseReceipt } from '@/lib/finance/receipt-files';

export type { ExpenseReceipt };

// Receipt pictures of expenses (migration 0053). Both reads use the
// caller's own session: expense_receipt_files_select lists the receipts of
// expenses the caller can read, and storage RLS (0052) signs a link only for
// the recorder and managers. Nothing here decides access itself.

// Signed links last ten minutes; pages re-sign on every load.
const RECEIPT_LINK_SECONDS = 600;

// The receipts of each of these expenses, in their order. An expense
// without any is absent from the map. Throws when the list can't be read.
export const getExpenseReceipts = async (expenseIds: string[]): Promise<Map<string, ExpenseReceipt[]>> => {
  const byExpense = new Map<string, ExpenseReceipt[]>();
  if (expenseIds.length === 0) return byExpense;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expense_receipt_files')
    .select('expense_id, storage_path, file_name, content_type, position, created_at')
    .in('expense_id', expenseIds)
    .order('position')
    .order('created_at');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { expense_id: string; storage_path: string; file_name: string | null; content_type: string | null }[];
  if (rows.length === 0) return byExpense;

  const links = new Map<string, string>();
  const { data: signed, error: signError } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrls(
    rows.map((r) => r.storage_path),
    RECEIPT_LINK_SECONDS,
  );
  if (signError) console.error('Receipt links could not be signed', signError.message);
  for (const item of signed ?? []) if (item.path && item.signedUrl) links.set(item.path, item.signedUrl);

  for (const row of rows) {
    const list = byExpense.get(row.expense_id) ?? [];
    list.push({ path: row.storage_path, name: row.file_name, contentType: row.content_type, url: links.get(row.storage_path) ?? null });
    byExpense.set(row.expense_id, list);
  }
  return byExpense;
};

// For a page: receipts are extra detail, so a failure shows the expenses
// without them rather than failing the page.
export const getExpenseReceiptsOrEmpty = (expenseIds: string[]) =>
  getExpenseReceipts(expenseIds).catch((error: unknown) => {
    console.error('Expense receipts could not be loaded', error instanceof Error ? error.message : error);
    return null;
  });
