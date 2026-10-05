'use server';

import { after } from 'next/server';

import { requireRole } from '@/lib/auth/guards';
import { isUuid } from '@/lib/security/validate';
import { logAuditEvent } from '@/lib/audit/log';
import { RATE_LIMIT_MESSAGE, checkRateLimit } from '@/lib/security/rate-limit';
import { z } from '@/lib/zod';
import { MAX_CELL_LENGTH, MERCHANT_BULK_COLUMNS, MERCHANT_BULK_MAX_FILE_BYTES } from '@/lib/bulk/merchant-csv';
import { PAYMENT_METHODS } from '@/lib/types';
import { cardPaymentsLive } from '@/lib/payments';
import { startBulkWorker } from '@/lib/bulk/worker';
import {
  bookMerchantDraft,
  cancelDraft,
  createMerchantDraft,
  getMerchantContext,
  processPendingRows,
  removeDraftRow,
  updateDraftRow,
} from '@/services/bulk/merchant-bulk';

import type { MerchantRowInput } from '@/lib/bulk/merchant-csv';
import type { PaymentMethod } from '@/lib/types';
import type { BookingResult, BulkReviewRow, MerchantContext } from '@/services/bulk/merchant-bulk';

// Merchant bulk shipments. Every action: a signed-in customer
// (requireRole), who the DATABASE says is an approved merchant with an
// active business (getMerchantContext), acting only on batches they
// uploaded (checked again in the service). Ids, prices, distances and
// coordinates are never taken from the browser.

type Failure = { success: false; error: string };

const fail = (error: unknown, fallback: string): Failure => ({
  success: false,
  error: error instanceof Error && error.message ? error.message : fallback,
});

const asMerchant = async (): Promise<MerchantContext> => getMerchantContext(await requireRole('customer'));

export type CreateBulkDraftResult = { success: true; batchId: string; rows: number } | Failure;

// `pickupAddress` is the batch's one pickup address (every row uses it);
// the server resolves and coverage-checks it before storing anything.
export const createBulkDraftAction = async (fileName: string, csvText: string, pickupAddress: string): Promise<CreateBulkDraftResult> => {
  if (typeof fileName !== 'string' || typeof csvText !== 'string') return { success: false, error: 'bulk.errors.notCsv' };
  if (typeof pickupAddress !== 'string' || pickupAddress.length > MAX_CELL_LENGTH) return { success: false, error: 'bulk.errors.pickupRequired' };
  if (!fileName.toLowerCase().endsWith('.csv')) return { success: false, error: 'bulk.errors.notCsv' };
  if (csvText.length > MERCHANT_BULK_MAX_FILE_BYTES) return { success: false, error: 'bulk.errors.tooLarge' };
  try {
    const merchant = await asMerchant();
    if (!(await checkRateLimit('bulkUploadPerUser', merchant.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
    const draft = await createMerchantDraft(merchant, { fileName, csvText, pickupAddress });
    // Checking carries on in the background even if the merchant leaves;
    // their review screen joins in while it's open.
    after(() => startBulkWorker(draft.id));
    return { success: true, batchId: draft.id, rows: draft.rows };
  } catch (error) {
    return fail(error, 'bulk.errors.uploadFailed');
  }
};

export type ProcessBulkDraftResult = { success: true; rows: BulkReviewRow[]; remaining: number; syncedAt: string } | Failure;

// Checks the next chunk of rows and returns everything finished since
// `since` (the background worker's rows too); the review screen calls it
// until `remaining` is 0.
export const processBulkDraftAction = async (batchId: string, since: string | null): Promise<ProcessBulkDraftResult> => {
  if (!isUuid(batchId)) return { success: false, error: 'bulk.errors.notFound' };
  const sinceTime = typeof since === 'string' && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : null;
  try {
    const merchant = await asMerchant();
    if (!(await checkRateLimit('bulkProcessPerUser', merchant.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
    return { success: true, ...(await processPendingRows(merchant, batchId, sinceTime)) };
  } catch (error) {
    return fail(error, 'bulk.errors.checkFailed');
  }
};

const rowInputSchema = z.object(
  Object.fromEntries(MERCHANT_BULK_COLUMNS.map((column) => [column, z.string().max(MAX_CELL_LENGTH)])) as Record<
    keyof MerchantRowInput,
    z.ZodString
  >,
);

export type UpdateBulkRowResult = { success: true; row: BulkReviewRow; affected: BulkReviewRow[] } | Failure;

export const updateBulkRowAction = async (rowId: string, input: MerchantRowInput): Promise<UpdateBulkRowResult> => {
  if (!isUuid(rowId)) return { success: false, error: 'bulk.errors.rowNotFound' };
  const parsed = rowInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'validation.invalid' };
  try {
    const merchant = await asMerchant();
    if (!(await checkRateLimit('bulkProcessPerUser', merchant.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
    return { success: true, ...(await updateDraftRow(merchant, rowId, parsed.data as MerchantRowInput)) };
  } catch (error) {
    return fail(error, 'bulk.errors.checkFailed');
  }
};

export type RemoveBulkRowResult = { success: true; affected: BulkReviewRow[] } | Failure;

export const removeBulkRowAction = async (rowId: string): Promise<RemoveBulkRowResult> => {
  if (!isUuid(rowId)) return { success: false, error: 'bulk.errors.rowNotFound' };
  try {
    return { success: true, ...(await removeDraftRow(await asMerchant(), rowId)) };
  } catch (error) {
    return fail(error, 'bulk.errors.removeFailed');
  }
};

export const cancelBulkDraftAction = async (batchId: string): Promise<{ success: true } | Failure> => {
  if (!isUuid(batchId)) return { success: false, error: 'bulk.errors.notFound' };
  try {
    await cancelDraft(await asMerchant(), batchId);
    return { success: true };
  } catch (error) {
    return fail(error, 'bulk.errors.cancelFailed');
  }
};

const bookSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
  // What the merchant saw and confirmed; the server books only if it still
  // matches exactly.
  expectedCount: z.number().int().min(1),
  expectedTotal: z.number().min(0),
});

export type BookBulkDraftResult = ({ success: true } & BookingResult) | Failure;

export const bookBulkDraftAction = async (
  batchId: string,
  input: { paymentMethod: PaymentMethod; expectedCount: number; expectedTotal: number },
): Promise<BookBulkDraftResult> => {
  if (!isUuid(batchId)) return { success: false, error: 'bulk.errors.notFound' };
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'validation.invalid' };
  // Card bookings would only wait for a payment that can't be taken yet.
  if (parsed.data.paymentMethod === 'card' && !cardPaymentsLive()) return { success: false, error: 'bulk.errors.cardUnavailable' };
  let merchant: MerchantContext;
  try {
    merchant = await asMerchant();
  } catch (error) {
    return fail(error, 'bulk.errors.notMerchant');
  }
  if (!(await checkRateLimit('bookingPerUser', merchant.id))) return { success: false, error: RATE_LIMIT_MESSAGE };

  try {
    const result = await bookMerchantDraft(merchant, batchId, parsed.data);
    if (!result.alreadyBooked) {
      await logAuditEvent({
        actorId: merchant.id,
        action: 'merchant.bulk_booking',
        entityType: 'shipment_batch',
        entityId: batchId,
        newValue: { reference: result.reference, booked: result.booked, skipped: result.skipped, total: result.total },
      });
    }
    return { success: true, ...result };
  } catch (error) {
    return fail(error, 'bulk.errors.bookingFailed');
  }
};
