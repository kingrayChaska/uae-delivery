import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeErrorMessage } from '@/lib/security/errors';
import { mapboxProvider } from '@/lib/maps/mapbox-provider';
import { bookingSchema } from '@/lib/shipment/schemas';
import { createShipment } from '@/services/shipments/create-shipment';

import type { BulkRowValidation } from '@/lib/business/schemas';
import type { BatchStatus, BulkRowResult } from '@/lib/bulk/schemas';

type OpenBatchInput = {
  customerId: string;
  createdBy: string;
  businessAccountId: string | null;
  name: string;
  pickupDate: string | null;
  notes: string;
  clientRequestId: string | null;
};

export type OpenedBatch = {
  id: string;
  reference: string;
  // True when this is a retry of a submission that already went through.
  existing: boolean;
  rowsSubmitted: number;
  rowsFailed: number;
};

// Inserted with the caller's own session, so the shipment_batches_insert
// RLS policy (migration 0020) decides whether they may open it.
export const openBatch = async (input: OpenBatchInput): Promise<OpenedBatch> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('shipment_batches')
    .insert({
      customer_id: input.customerId,
      created_by: input.createdBy,
      business_account_id: input.businessAccountId,
      name: input.name,
      pickup_date: input.pickupDate,
      notes: input.notes,
      client_request_id: input.clientRequestId,
    })
    .select('id, reference')
    .single();

  if (data) return { id: data.id, reference: data.reference, existing: false, rowsSubmitted: 0, rowsFailed: 0 };

  if (error?.code === '23505' && input.clientRequestId) {
    const { data: existing } = await supabase
      .from('shipment_batches')
      .select('id, reference, rows_submitted, rows_failed')
      .eq('customer_id', input.customerId)
      .eq('client_request_id', input.clientRequestId)
      .maybeSingle();
    if (existing) {
      return {
        id: existing.id,
        reference: existing.reference,
        existing: true,
        rowsSubmitted: existing.rows_submitted,
        rowsFailed: existing.rows_failed,
      };
    }
  }

  throw new Error(safeErrorMessage(error, 'Could not start this bulk list'));
};

// Each valid row is geocoded, routed and priced server-side by the same
// createShipment() the booking wizard uses, so bulk shipments get exactly
// the same price integrity as a single booking. Rows run one at a time to
// stay within Mapbox rate limits; a row that fails never blocks the others.
// Addresses repeat a lot in a bulk list (usually one warehouse pickup), so
// each distinct address is geocoded once per list.
export const createBatchShipments = async ({
  customerId,
  businessAccountId,
  batchId,
  validations,
}: {
  customerId: string;
  businessAccountId: string | null;
  batchId: string | null;
  validations: BulkRowValidation[];
}): Promise<BulkRowResult[]> => {
  const geocodeCache = new Map<string, ReturnType<typeof mapboxProvider.geocode>>();
  const geocode = (address: string) => {
    const key = address.trim().toLowerCase();
    if (!geocodeCache.has(key)) geocodeCache.set(key, mapboxProvider.geocode(address));
    return geocodeCache.get(key)!;
  };

  const results: BulkRowResult[] = [];

  for (const { rowNumber, row, error } of validations) {
    if (!row) {
      results.push({ rowNumber, ok: false, message: error ?? 'Invalid row' });
      continue;
    }

    try {
      let pickup;
      let dropoff;
      try {
        [pickup, dropoff] = await Promise.all([geocode(row.pickup_address), geocode(row.dropoff_address)]);
      } catch {
        throw new Error('Could not find one of the addresses — check the spelling or add the area/emirate');
      }

      const parsed = bookingSchema.safeParse({
        pickup: {
          address: pickup.formattedAddress,
          lat: pickup.coordinates.lat,
          lng: pickup.coordinates.lng,
          contactName: row.pickup_contact_name,
          contactPhone: row.pickup_contact_phone,
        },
        dropoff: {
          address: dropoff.formattedAddress,
          lat: dropoff.coordinates.lat,
          lng: dropoff.coordinates.lng,
          contactName: row.dropoff_contact_name,
          contactPhone: row.dropoff_contact_phone,
        },
        packageType: row.package_type,
        packageDescription: row.package_description,
        packageQuantity: row.quantity,
        packageWeightKg: row.weight_kg,
        isFragile: row.fragile,
        packageImagePath: null,
        paymentMethod: row.payment_method,
        deliveryType: row.delivery_type,
        recipientPaymentType: row.cod_amount > 0 ? 'postpaid' : 'prepaid',
        codAmount: row.cod_amount > 0 ? row.cod_amount : undefined,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid row');

      const shipment = await createShipment(customerId, parsed.data, businessAccountId, batchId);
      results.push({ rowNumber, ok: true, message: `${shipment.trackingNumber} · AED ${shipment.price.toFixed(2)}` });
    } catch (rowError) {
      results.push({
        rowNumber,
        ok: false,
        message: rowError instanceof Error ? rowError.message : 'Could not create this shipment',
      });
    }
  }

  return results;
};

// shipment_batches has no UPDATE policy — closing a batch is a trusted,
// server-side step, like the COD "expected" record. Moving it out of
// 'processing' also fires the one batch-level notification (migration 0020).
export const finalizeBatch = async (batchId: string, results: BulkRowResult[]): Promise<BatchStatus> => {
  const failed = results.filter((r) => !r.ok);
  const status: BatchStatus =
    failed.length === 0 ? 'submitted' : failed.length === results.length ? 'failed' : 'partially_failed';

  const admin = createAdminClient();
  const { error } = await admin
    .from('shipment_batches')
    .update({
      status,
      rows_submitted: results.length,
      rows_failed: failed.length,
      failed_rows: failed.map(({ rowNumber, message }) => ({ rowNumber, message })),
    })
    .eq('id', batchId);

  if (error) console.error('Failed to finalize shipment batch', batchId, error.message);
  return status;
};
