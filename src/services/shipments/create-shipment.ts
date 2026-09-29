import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import {
  BOOKING_ERRORS,
  distanceLimitMessage,
  validateBookingLocations,
  validateRoute,
} from '@/lib/shipment/booking-guards';
import { mapboxProvider } from '@/lib/maps/mapbox-provider';
import { requireServiceableTrip } from '@/lib/service-areas/verify';
import { getActivePricingRules } from '@/lib/pricing/get-active-rule';
import { isFallbackRule } from '@/lib/pricing/config';
import { calculateShipmentPrice } from '@/lib/pricing/calculate';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { BookingInput } from '@/lib/shipment/schemas';
import type { AccountType, PriceBreakdown, PricingRule, PricingRuleSet, Shipment } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';
import type { Emirate } from '@/lib/service-areas/config';

// Cash on delivery (the goods amount and/or a cash delivery fee) is
// recorded by a database trigger when a driver is assigned — see
// sync_shipment_cod_transaction, migration 0022.

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

// Customer-typed details and Mapbox's structured address for one end of the
// trip. The coordinates (pickup_lat/lng etc.) stay the authoritative location;
// `emirate` in *_place is the one this server confirmed, not the browser's.
const locationDetailColumns = (prefix: 'pickup' | 'dropoff', location: BookingInput['pickup'], emirate: Emirate) => ({
  [`${prefix}_building`]: location.building?.trim() || null,
  [`${prefix}_unit`]: location.unit?.trim() || null,
  [`${prefix}_floor`]: location.floor?.trim() || null,
  [`${prefix}_instructions`]: location.instructions?.trim() || null,
  [`${prefix}_place`]: { ...location.place, emirate },
});

export type BookingCustomer = {
  id: string;
  accountType: AccountType;
  // Approved merchants' shipments are tagged with their business account.
  merchantBusinessAccountId: string | null;
};

// Account type is read from the database, never from the request. The
// caller's own session reads it: a customer can read their own profile,
// staff can read any customer's.
export const getBookingCustomer = async (customerId: string): Promise<BookingCustomer> => {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, account_type')
    .eq('id', customerId)
    .maybeSingle();
  if (!profile) throw new Error('booking.errors.customerNotFound');

  let merchantBusinessAccountId: string | null = null;
  if (profile.account_type === 'merchant') {
    const { data: membership } = await supabase
      .from('business_account_members')
      .select('business_account_id, business_accounts(active)')
      .eq('profile_id', customerId);
    const active = (membership ?? []).find((row) => {
      const business = row.business_accounts as { active: boolean } | { active: boolean }[] | null;
      return Array.isArray(business) ? business[0]?.active : business?.active;
    });
    merchantBusinessAccountId = active?.business_account_id ?? null;
  }

  return { id: profile.id, accountType: profile.account_type as AccountType, merchantBusinessAccountId };
};

export type ShipmentQuote = {
  input: BookingInput;
  rule: PricingRule;
  breakdown: PriceBreakdown;
  // Confirmed by requireServiceableTrip, and stored with the shipment.
  emirates: { pickup: Emirate; dropoff: Emirate };
};

// Validates one shipment and prices it from a route this server computed —
// distance, duration and price are never read from the request. Throws a
// customer-readable message when the shipment can't be booked.
export const quoteShipment = async (
  customer: BookingCustomer,
  input: BookingInput,
  rules?: PricingRuleSet,
): Promise<ShipmentQuote> => {
  const pickup = { lat: input.pickup.lat, lng: input.pickup.lng };
  const dropoff = { lat: input.dropoff.lat, lng: input.dropoff.lng };

  const locationError = validateBookingLocations(pickup, dropoff);
  if (locationError) throw new Error(locationError);

  // Both ends must be in a fully supported emirate (lib/service-areas).
  // Checked from the coordinates on this server, before anything is priced.
  const emirates = await requireServiceableTrip(pickup, dropoff);

  if (customer.accountType === 'merchant' && (input.packageWeightKg === undefined || input.packageWeightKg <= 0)) {
    throw new Error(BOOKING_ERRORS.weightRequired);
  }

  const rule = (rules ?? (await getActivePricingRules()))[customer.accountType][input.deliveryType];
  if (isFallbackRule(rule)) {
    // An in-code fallback has no database row, so the database's price
    // check would reject it anyway. Fail clearly instead.
    throw new Error('booking.errors.pricingMissing');
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

  const breakdown = calculateShipmentPrice({
    rule,
    distanceKm: route.distanceKm,
    durationMinutes: route.durationMinutes,
    weightKg: input.packageWeightKg ?? null,
    recipientPaymentType: input.recipientPaymentType,
    shipmentQuantity: input.packageQuantity,
    codAmount: input.codAmount,
  });

  if (breakdown.exceedsDistanceLimit) {
    throw new Error(distanceLimitMessage(breakdown.distanceKm, breakdown.maxDistanceKm));
  }

  return { input, rule, breakdown, emirates };
};

// Inserts a priced shipment with the caller's own session, so the
// shipments_insert RLS policy independently re-checks every component of
// the price against the active rule, the distance limit and the customer's
// account type (migration 0022) — a backstop against a request that skips
// this service and hits the Supabase REST API directly.
export const insertQuotedShipment = async (
  customer: BookingCustomer,
  { input, rule, breakdown, emirates }: ShipmentQuote,
  { businessAccountId = null, batchId = null }: { businessAccountId?: string | null; batchId?: string | null } = {},
): Promise<Shipment> => {
  const supabase = await createClient();

  // Cash-paid delivery fees don't need upfront payment, so they go straight
  // to 'confirmed'. Card bookings sit at 'pending_payment' — there's no live
  // payment provider wired up yet (lib/payments is a documented stub), so
  // this is the honest state rather than faking a successful charge.
  const status = input.paymentMethod === 'cod' ? 'confirmed' : 'pending_payment';
  const postpaid = input.recipientPaymentType === 'postpaid';

  const { data, error } = await supabase
    .from('shipments')
    .insert({
      customer_id: customer.id,
      business_account_id: businessAccountId ?? customer.merchantBusinessAccountId,
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
      ...locationDetailColumns('pickup', input.pickup, emirates.pickup),
      ...locationDetailColumns('dropoff', input.dropoff, emirates.dropoff),
      distance_km: breakdown.distanceKm,
      duration_minutes: breakdown.durationMinutes,
      pricing_rule_id: rule.id,
      delivery_type: input.deliveryType,
      base_charge: breakdown.basePrice,
      distance_charge: breakdown.distanceCharge,
      weight_charge: breakdown.weightCharge,
      cod_charge: breakdown.codCharge,
      price: breakdown.totalPrice,
      currency: breakdown.currency,
      payment_method: input.paymentMethod,
      recipient_payment_type: input.recipientPaymentType,
      cod_amount: postpaid ? (input.codAmount ?? 0) : 0,
      product_value: input.productValue ?? null,
      package_type: input.packageType,
      package_description: input.packageDescription,
      package_quantity: input.packageQuantity,
      package_weight_kg: breakdown.weightKg,
      package_length_cm: input.packageLengthCm ?? null,
      package_width_cm: input.packageWidthCm ?? null,
      package_height_cm: input.packageHeightCm ?? null,
      is_fragile: input.isFragile,
      package_image_url: input.packageImagePath ?? null,
      client_request_id: input.clientRequestId ?? null,
    })
    .select(SHIPMENT_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    // Two identical submits raced past the lookup in createShipment; the
    // unique index (migration 0019) let exactly one insert through.
    if (error?.code === '23505' && input.clientRequestId) {
      const existing = await findByClientRequestId(customer.id, input.clientRequestId);
      if (existing) return existing;
    }
    throw new Error(safeErrorMessage(error, 'booking.errors.createFailed'));
  }

  return mapRowToShipment(data as ShipmentRow);
};

// Quote + insert for a single shipment. Used by the staff CSV upload and
// anything else that books one shipment at a time.
export const createShipment = async (
  customerId: string,
  input: BookingInput,
  businessAccountId: string | null = null,
  batchId: string | null = null,
): Promise<Shipment> => {
  // A retry of a booking that already went through: hand back the original
  // instead of creating a second shipment (and skip the paid Mapbox call).
  if (input.clientRequestId) {
    const existing = await findByClientRequestId(customerId, input.clientRequestId);
    if (existing) return existing;
  }

  const customer = await getBookingCustomer(customerId);
  const quote = await quoteShipment(customer, input);
  return insertQuotedShipment(customer, quote, { businessAccountId, batchId });
};

export { findByClientRequestId };
