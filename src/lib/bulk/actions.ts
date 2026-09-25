'use server';

import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { RATE_LIMIT_MESSAGE, checkRateLimit } from '@/lib/security/rate-limit';
import { BULK_MAX_ROWS, validateBulkRecords } from '@/lib/business/schemas';
import {
  PICKUP_COLUMNS,
  applyPickupDefaults,
  bulkBatchDetailsSchema,
  sanitizeBulkRecords,
} from '@/lib/bulk/schemas';
import { createBatchShipments, finalizeBatch, openBatch } from '@/services/bulk/create-batch';

import type { BulkBatchDetailsInput, BulkRowResult, PickupDefaults } from '@/lib/bulk/schemas';

export type SubmitBulkBatchInput = {
  details: BulkBatchDetailsInput;
  pickup: PickupDefaults;
  rows: Record<string, string>[];
};

export type SubmitBulkBatchResult =
  | { success: true; batchId: string; reference: string; created: number; failed: number; rows: BulkRowResult[] }
  | { success: false; error: string };

// A customer (typically an organisation shipping in volume) submits a whole
// list at once. The browser's live validation is a convenience only: every
// row is re-sanitized and re-validated here, and each shipment is then
// geocoded, routed and priced server-side like any single booking.
export const submitBulkBatchAction = async (input: SubmitBulkBatchInput): Promise<SubmitBulkBatchResult> => {
  const profile = await requireRole('customer');

  const details = bulkBatchDetailsSchema.safeParse(input?.details);
  if (!details.success) return { success: false, error: details.error.issues[0]?.message ?? 'Invalid list details' };

  const records = sanitizeBulkRecords(input?.rows);
  if (!records || records.length === 0) return { success: false, error: 'Add at least one shipment to the list' };
  if (records.length > BULK_MAX_ROWS) {
    return { success: false, error: `A list can hold at most ${BULK_MAX_ROWS} shipments (got ${records.length})` };
  }

  const pickup = Object.fromEntries(
    PICKUP_COLUMNS.map((column) => [column, String(input?.pickup?.[column] ?? '').trim().slice(0, 500)]),
  ) as PickupDefaults;

  // There's no header row in an on-screen list, so row numbers here are the
  // 1-based list position the customer sees ("Shipment 3"), not CSV lines.
  const validations = validateBulkRecords(applyPickupDefaults(records, pickup)).map((v) => ({
    ...v,
    rowNumber: v.rowNumber - 1,
  }));
  if (validations.every((v) => v.error)) {
    return { success: false, error: 'None of the rows are valid yet — fix the highlighted rows and try again' };
  }

  if (!(await checkRateLimit('bulkUploadPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };

  const { businessAccountId } = details.data;
  if (businessAccountId) {
    // RLS already refuses a business the customer isn't a member of; this
    // adds the "still active" check and a clearer message.
    const supabase = await createClient();
    const { data: membership } = await supabase
      .from('business_account_members')
      .select('business_accounts(active)')
      .eq('business_account_id', businessAccountId)
      .eq('profile_id', profile.id)
      .maybeSingle();
    const business = membership?.business_accounts as { active: boolean } | { active: boolean }[] | null | undefined;
    const active = Array.isArray(business) ? business[0]?.active : business?.active;
    if (!active) return { success: false, error: 'That business account is not available' };
  }

  let batch;
  try {
    batch = await openBatch({
      customerId: profile.id,
      createdBy: profile.id,
      businessAccountId,
      name: details.data.name,
      pickupDate: details.data.pickupDate,
      notes: details.data.notes,
      clientRequestId: details.data.clientRequestId,
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not submit this list' };
  }

  // A retry of a list that already went through: hand back the original.
  if (batch.existing) {
    return {
      success: true,
      batchId: batch.id,
      reference: batch.reference,
      created: batch.rowsSubmitted - batch.rowsFailed,
      failed: batch.rowsFailed,
      rows: [],
    };
  }

  const results = await createBatchShipments({
    customerId: profile.id,
    businessAccountId,
    batchId: batch.id,
    validations,
  });
  await finalizeBatch(batch.id, results);

  const created = results.filter((r) => r.ok).length;
  return {
    success: true,
    batchId: batch.id,
    reference: batch.reference,
    created,
    failed: results.length - created,
    rows: results,
  };
};
