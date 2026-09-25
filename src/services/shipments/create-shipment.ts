import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { BOOKING_ERRORS, validateBookingLocations, validateRoute } from '@/lib/shipment/booking-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { mapboxProvider } from '@/lib/maps/mapbox-provider';
import { getActivePricingRule } from '@/lib/pricing/get-active-rule';
import { calculatePrice } from '@/lib/pricing/calculate';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { BookingInput } from '@/lib/shipment/schemas';
import type { Shipment } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';

// cod_transactions has no INSERT policy for ordinary users (migration 0007)
// — the "expected" row is a system-generated record, the same way
// notifications/audit_logs are, so it's created below with the
// service-role client after the shipment itself was already inserted (and
// RLS-validated) via the customer's own session.
const createExpectedCodRecord = async (shipmentId: string, customerId: string, amount: number) => {
  const admin = createAdminClient();
  await admin.from('cod_transactions').insert({
    shipment_id: shipmentId,
    customer_id: customerId,
    amount,
    status: 'expected',
  });
};

const findByClientRequestId = async (customerId: string, clientRequestId: string): Promise<Shipment | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS)
    .eq('customer_id', customerId)
    .eq('client_request_id', clientRequestId)
    .maybeSingle();
  return data ? mapRowToShipment(data as ShipmentRow) : null;
};

// Distance, duration and price are computed HERE, from the coordinates the
// person picked via AddressAutocomplete — never read from a client-supplied
// price field, because there isn't one on the wire in the first place. The
// shipments_insert RLS policy (migration 0006) independently re-checks this
// same consistency as a backstop against a request that bypasses this
// service entirely and hits the Supabase REST API directly.
export const createShipment = async (
  customerId: string,
  input: BookingInput,
  businessAccountId: string | null = null,
  batchId: string | null = null,
): Promise<Shipment> => {
  const supabase = await createClient();
  const pickup = { lat: input.pickup.lat, lng: input.pickup.lng };
  const dropoff = { lat: input.dropoff.lat, lng: input.dropoff.lng };

  const locationError = validateBookingLocations(pickup, dropoff);
  if (locationError) throw new Error(locationError);

  // A retry of a booking that already went through: hand back the original
  // instead of creating a second shipment (and skip the paid Mapbox call).
  if (input.clientRequestId) {
    const existing = await findByClientRequestId(customerId, input.clientRequestId);
    if (existing) return existing;
  }

  let route;
  try {
    route = await mapboxProvider.getRoute(pickup, dropoff);
  } catch {
    // Whatever went wrong (network, bad token, no route) the customer sees
    // the spec's message; details belong in server logs, not the UI.
    throw new Error(BOOKING_ERRORS.routeFailed);
  }
  const routeError = validateRoute(route);
  if (routeError) throw new Error(routeError);

  const rule = await getActivePricingRule();
  if (rule.id === 'default') {
    // The in-code fallback rule (lib/pricing/calculate.ts) has no real DB
    // row — inserting against it would fail the RLS price-consistency
    // check anyway. Fail clearly here instead of a confusing RLS error.
    throw new Error('Pricing is not configured. Please contact support.');
  }

  const breakdown = calculatePrice(route.distanceKm, route.durationMinutes, rule);

  // COD doesn't need upfront payment, so it can go straight to 'confirmed'.
  // Card bookings sit at 'pending_payment' — there's no live payment
  // provider wired up yet (lib/payments is a documented stub), so this is
  // the honest state rather than faking a successful charge.
  const status = input.paymentMethod === 'cod' ? 'confirmed' : 'pending_payment';

  const { data, error } = await supabase
    .from('shipments')
    .insert({
      customer_id: customerId,
      business_account_id: businessAccountId,
      batch_id: batchId,
      status,
      pickup_address: input.pickup.address,
      pickup_lat: input.pickup.lat,
      pickup_lng: input.pickup.lng,
      pickup_contact_name: input.pickup.contactName,
      pickup_contact_phone: input.pickup.contactPhone,
      dropoff_address: input.dropoff.address,
      dropoff_lat: input.dropoff.lat,
      dropoff_lng: input.dropoff.lng,
      dropoff_contact_name: input.dropoff.contactName,
      dropoff_contact_phone: input.dropoff.contactPhone,
      distance_km: breakdown.distanceKm,
      duration_minutes: breakdown.durationMinutes,
      pricing_rule_id: rule.id,
      price: breakdown.totalPrice,
      currency: breakdown.currency,
      payment_method: input.paymentMethod,
      package_type: input.packageType,
      package_description: input.packageDescription,
      package_quantity: input.packageQuantity,
      package_weight_kg: input.packageWeightKg ?? null,
      is_fragile: input.isFragile,
      package_image_url: input.packageImagePath ?? null,
      client_request_id: input.clientRequestId ?? null,
    })
    .select(SHIPMENT_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    // Two identical submits raced past the lookup above; the unique index
    // (migration 0019) let exactly one insert through. Return that one.
    if (error?.code === '23505' && input.clientRequestId) {
      const existing = await findByClientRequestId(customerId, input.clientRequestId);
      if (existing) return existing;
    }
    throw new Error(safeErrorMessage(error, 'Could not create the shipment'));
  }

  const shipment = mapRowToShipment(data as ShipmentRow);

  if (input.paymentMethod === 'cod') {
    await createExpectedCodRecord(shipment.id, customerId, shipment.price);
  }

  return shipment;
};
