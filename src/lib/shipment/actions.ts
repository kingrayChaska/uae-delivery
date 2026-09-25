'use server';

import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';
import { safeErrorMessage } from '@/lib/security/errors';
import { isUuid } from '@/lib/security/validate';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { RATE_LIMIT_MESSAGE, checkIpRateLimit, checkRateLimit } from '@/lib/security/rate-limit';
import { getShipmentTracking } from '@/services/tracking/get-shipment-tracking';
import { createShipment } from '@/services/shipments/create-shipment';
import { bookingSchema, trackingLookupSchema } from '@/lib/shipment/schemas';

import type { BookingInput, TrackingLookupInput } from '@/lib/shipment/schemas';
import type { Shipment } from '@/lib/types';
import type { PublicTrackingResult, TrackingHistoryEntry } from '@/services/tracking/get-shipment-tracking';

export type TrackShipmentResult =
  | { success: true; tracking: PublicTrackingResult; history: TrackingHistoryEntry[] }
  | { success: false; error: string };

// Public and unauthenticated by design, so it's the most exposed action in
// the app: Turnstile + a per-IP limit, on top of unguessable tracking
// numbers (migration 0018), keep it from being used to enumerate shipments.
export const trackShipmentAction = async (
  input: TrackingLookupInput,
  turnstileToken?: string,
): Promise<TrackShipmentResult> => {
  const parsed = trackingLookupSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const human = await verifyTurnstile(turnstileToken);
  if (!human.ok) return { success: false, error: human.error };
  if (!(await checkIpRateLimit('trackingPerIp'))) return { success: false, error: RATE_LIMIT_MESSAGE };

  const result = await getShipmentTracking(parsed.data.trackingNumber.trim().toUpperCase());
  if (!result) {
    return { success: false, error: 'No shipment found for that tracking number.' };
  }

  return { success: true, tracking: result.tracking, history: result.history };
};

export type CreateShipmentResult = { success: true; shipment: Shipment } | { success: false; error: string };

export const createShipmentAction = async (input: BookingInput): Promise<CreateShipmentResult> => {
  // requireRole throws (AuthError/ForbiddenError) rather than returning
  // false — this is the real authorization boundary, independent of
  // whatever the browser's UI state claims. Only a signed-in customer can
  // reach the insert below at all.
  const profile = await requireRole('customer');
  if (!(await checkRateLimit('bookingPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };

  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const shipment = await createShipment(profile.id, parsed.data);
    return { success: true, shipment };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to book this delivery. Please try again.';
    return { success: false, error: message };
  }
};

// Operator/Manager booking on a customer's behalf (phone orders, walk-ins).
// The same createShipment service recomputes route + price server-side;
// the only difference is who the shipment belongs to, which is verified
// here to be a real, active customer profile rather than trusted from the
// client-supplied id.
export const createShipmentForCustomerAction = async (
  customerId: string,
  input: BookingInput,
): Promise<CreateShipmentResult> => {
  const profile = await requireRole('operator', 'manager');
  if (!isUuid(customerId)) return { success: false, error: 'Select a valid, active customer' };
  if (!(await checkRateLimit('bookingPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };

  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', customerId)
    .maybeSingle();

  if (!customer || customer.role !== 'customer' || !customer.active) {
    return { success: false, error: 'Select a valid, active customer' };
  }

  try {
    const shipment = await createShipment(customerId, parsed.data);
    await logAuditEvent({
      actorId: profile.id,
      action: 'shipment.create_on_behalf',
      entityType: 'shipment',
      entityId: shipment.id,
      newValue: { customerId, trackingNumber: shipment.trackingNumber, price: shipment.price },
    });
    return { success: true, shipment };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to book this delivery. Please try again.';
    return { success: false, error: message };
  }
};

const CANCELLABLE_STATUSES: Shipment['status'][] = ['pending_payment', 'confirmed', 'assigned', 'driver_accepted'];

export type CancelShipmentResult = { success: true } | { success: false; error: string };

export const cancelShipmentAction = async (shipmentId: string): Promise<CancelShipmentResult> => {
  const profile = await requireRole('customer');
  if (!isUuid(shipmentId)) return { success: false, error: 'Shipment not found' };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('shipments')
    .select('id, customer_id, status')
    .eq('id', shipmentId)
    .maybeSingle();

  if (!existing || existing.customer_id !== profile.id) {
    return { success: false, error: 'Shipment not found' };
  }
  if (!CANCELLABLE_STATUSES.includes(existing.status)) {
    return { success: false, error: 'This delivery can no longer be cancelled' };
  }

  const { error } = await supabase.from('shipments').update({ status: 'cancelled' }).eq('id', shipmentId);
  if (error) return { success: false, error: safeErrorMessage(error) };

  return { success: true };
};
