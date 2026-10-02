import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getActivePricingRules } from '@/lib/pricing/get-active-rule';
import { sumPrices } from '@/lib/pricing/calculate';
import { todayInUae } from '@/lib/bulk/schemas';
import { finalizeBatch, openBatch } from '@/services/bulk/create-batch';
import {
  findByClientRequestId,
  getBookingCustomer,
  insertQuotedShipment,
  quoteShipment,
} from '@/services/shipments/create-shipment';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { MultiBookingInput } from '@/lib/shipment/schemas';
import type { Shipment } from '@/lib/types';
import type { ShipmentQuote } from '@/services/shipments/create-shipment';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';
import type { BulkRowResult } from '@/lib/bulk/schemas';

import { msg } from '@/i18n/message';

export type BookingOutcome = {
  shipments: Shipment[];
  // Set when the booking held more than one shipment (one shipment_batches row).
  batchId: string | null;
  reference: string | null;
  total: number;
  failed: { index: number; message: string }[];
};

const listBatchShipments = async (batchId: string): Promise<Shipment[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS)
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });
  return ((data ?? []) as ShipmentRow[]).map(mapRowToShipment);
};

const toOutcome = (shipments: Shipment[], batchId: string | null, reference: string | null): BookingOutcome => ({
  shipments,
  batchId,
  reference,
  total: sumPrices(shipments.map((s) => s.price)),
  failed: [],
});

// Books everything the wizard submitted. Every shipment is validated,
// routed and priced first; if any one of them can't be booked (outside the
// UAE, over the distance limit, missing merchant weight, ...) nothing is
// created and the customer is told which one to fix. Only then are the
// shipments inserted. Several shipments become one batch, so operators
// dispatch them as one booking and the customer gets one notification.
export const createBooking = async ({
  customerId,
  createdBy,
  input,
}: {
  customerId: string;
  createdBy: string;
  input: MultiBookingInput;
}): Promise<BookingOutcome> => {
  const customer = await getBookingCustomer(customerId);
  const shipments = input.shipments.map((shipment, index) => ({
    ...shipment,
    paymentMethod: input.paymentMethod,
    clientRequestId: shipment.clientRequestId ?? (input.shipments.length === 1 ? input.clientRequestId : undefined),
    index,
  }));

  // A retry of a single-shipment booking that already went through.
  if (shipments.length === 1 && shipments[0].clientRequestId) {
    const existing = await findByClientRequestId(customerId, shipments[0].clientRequestId);
    if (existing) return toOutcome([existing], null, null);
  }

  const rules = await getActivePricingRules();
  const quotes: ShipmentQuote[] = [];
  // One at a time: stays within Google Maps rate limits, and a booking holds at
  // most MAX_SHIPMENTS_PER_BOOKING shipments.
  for (const { index, ...shipment } of shipments) {
    try {
      quotes.push(await quoteShipment(customer, shipment, rules));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'booking.errors.cannotBook';
      throw new Error(shipments.length > 1 ? msg('booking.errors.shipmentPrefix', { number: index + 1, message }) : message);
    }
  }

  if (quotes.length === 1) {
    const shipment = await insertQuotedShipment(customer, quotes[0]);
    return toOutcome([shipment], null, null);
  }

  const batch = await openBatch({
    customerId,
    createdBy,
    businessAccountId: customer.merchantBusinessAccountId,
    name: `Booking of ${quotes.length} shipments`,
    pickupDate: todayInUae(),
    notes: '',
    clientRequestId: input.clientRequestId,
  });

  // A retry of a multi-shipment booking that already went through.
  if (batch.existing) return toOutcome(await listBatchShipments(batch.id), batch.id, batch.reference);

  const created: Shipment[] = [];
  const results: BulkRowResult[] = [];
  const failed: BookingOutcome['failed'] = [];
  for (const [index, quote] of quotes.entries()) {
    try {
      const shipment = await insertQuotedShipment(customer, quote, { batchId: batch.id });
      created.push(shipment);
      results.push({ rowNumber: index + 1, ok: true, message: shipment.trackingNumber });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'booking.errors.createOneFailed';
      failed.push({ index, message });
      results.push({ rowNumber: index + 1, ok: false, message });
    }
  }
  await finalizeBatch(batch.id, results);

  return { ...toOutcome(created, batch.id, batch.reference), failed };
};
