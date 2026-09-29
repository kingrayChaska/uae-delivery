'use server';

import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';
import { safeErrorMessage } from '@/lib/security/errors';
import { isUuid } from '@/lib/security/validate';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { RATE_LIMIT_MESSAGE, checkIpRateLimit, checkRateLimit } from '@/lib/security/rate-limit';
import { getShipmentTracking } from '@/services/tracking/get-shipment-tracking';
import { createBooking } from '@/services/shipments/create-booking';
import { multiBookingSchema, normalizeTrackingCode, trackingLookupSchema } from '@/lib/shipment/schemas';

import { msg } from '@/i18n/message';

import type { MultiBookingInput, TrackingLookupInput } from '@/lib/shipment/schemas';
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

  const result = await getShipmentTracking(normalizeTrackingCode(parsed.data.trackingNumber));
  if (!result) {
    return { success: false, error: 'tracking.errors.notFound' };
  }

  return { success: true, tracking: result.tracking, history: result.history };
};

export type CreateBookingResult =
  | {
      success: true;
      shipmentIds: string[];
      batchId: string | null;
      reference: string | null;
      total: number;
      failed: { index: number; message: string }[];
    }
  | { success: false; error: string };

const runBooking = async (customerId: string, createdBy: string, input: MultiBookingInput): Promise<CreateBookingResult> => {
  const parsed = multiBookingSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const shipmentIndex = issue?.path[0] === 'shipments' ? Number(issue.path[1]) : NaN;
    const message = issue?.message ?? 'validation.invalid';
    return {
      success: false,
      error:
        Number.isInteger(shipmentIndex) && input.shipments.length > 1
          ? msg('booking.errors.shipmentPrefix', { number: shipmentIndex + 1, message })
          : message,
    };
  }

  try {
    const outcome = await createBooking({ customerId, createdBy, input: parsed.data });
    return {
      success: true,
      shipmentIds: outcome.shipments.map((shipment) => shipment.id),
      batchId: outcome.batchId,
      reference: outcome.reference,
      total: outcome.total,
      failed: outcome.failed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'booking.errors.bookingFailed';
    return { success: false, error: message };
  }
};

// One or more shipments booked together. requireRole throws
// (AuthError/ForbiddenError) rather than returning false — this is the real
// authorization boundary, independent of whatever the browser's UI state
// claims. Prices, distances and the customer's account type are all worked
// out on the server (services/shipments/create-booking.ts).
export const createBookingAction = async (input: MultiBookingInput): Promise<CreateBookingResult> => {
  const profile = await requireRole('customer');
  if (!(await checkRateLimit('bookingPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  return runBooking(profile.id, profile.id, input);
};

// Operator/Manager booking on a customer's behalf (phone orders, walk-ins).
// The same service recomputes route + price server-side, using the
// customer's own account type; the only difference is who the shipments
// belong to, which is verified here to be a real, active customer profile
// rather than trusted from the client-supplied id.
export const createBookingForCustomerAction = async (
  customerId: string,
  input: MultiBookingInput,
): Promise<CreateBookingResult> => {
  const profile = await requireRole('operator', 'manager');
  if (!isUuid(customerId)) return { success: false, error: 'booking.errors.selectCustomer' };
  if (!(await checkRateLimit('bookingPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', customerId)
    .maybeSingle();

  if (!customer || customer.role !== 'customer' || !customer.active) {
    return { success: false, error: 'booking.errors.selectCustomer' };
  }

  const result = await runBooking(customerId, profile.id, input);
  if (result.success) {
    await logAuditEvent({
      actorId: profile.id,
      action: 'shipment.create_on_behalf',
      entityType: result.batchId ? 'shipment_batch' : 'shipment',
      entityId: result.batchId ?? result.shipmentIds[0],
      newValue: { customerId, shipmentIds: result.shipmentIds, total: result.total },
    });
  }
  return result;
};

export type FindShipmentResult = { success: true; shipmentId: string } | { success: false; error: string };

// Tracking from inside the customer dashboard. RLS (shipments_select) limits
// the search to the customer's own shipments, so there's no Turnstile or
// public rate limit here — a guess can only ever find your own parcel.
export const findMyShipmentByCodeAction = async (input: TrackingLookupInput): Promise<FindShipmentResult> => {
  const profile = await requireRole('customer');
  const parsed = trackingLookupSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'tracking.errors.tooLong' };

  const code = normalizeTrackingCode(parsed.data.trackingNumber);
  // Codes are letters/digits (legacy ones add dashes). Anything else can't
  // match — and must never reach the PostgREST filter string below.
  if (!/^[A-Z0-9-]+$/.test(code)) return { success: false, error: 'tracking.errors.notYours' };
  const supabase = await createClient();
  const { data } = await supabase
    .from('shipments')
    .select('id')
    .eq('customer_id', profile.id)
    .or(`tracking_number.eq.${code},legacy_tracking_number.eq.${code}`)
    .maybeSingle();

  if (!data) return { success: false, error: 'tracking.errors.notYours' };
  return { success: true, shipmentId: data.id };
};

const CANCELLABLE_STATUSES: Shipment['status'][] = ['pending_payment', 'confirmed', 'assigned', 'driver_accepted'];

export type CancelShipmentResult = { success: true } | { success: false; error: string };

export const cancelShipmentAction = async (shipmentId: string): Promise<CancelShipmentResult> => {
  const profile = await requireRole('customer');
  if (!isUuid(shipmentId)) return { success: false, error: 'booking.errors.cancelNotFound' };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('shipments')
    .select('id, customer_id, status')
    .eq('id', shipmentId)
    .maybeSingle();

  if (!existing || existing.customer_id !== profile.id) {
    return { success: false, error: 'booking.errors.cancelNotFound' };
  }
  if (!CANCELLABLE_STATUSES.includes(existing.status)) {
    return { success: false, error: 'booking.errors.cannotCancel' };
  }

  const { error } = await supabase.from('shipments').update({ status: 'cancelled' }).eq('id', shipmentId);
  if (error) return { success: false, error: safeErrorMessage(error) };

  return { success: true };
};
