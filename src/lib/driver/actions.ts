'use server';

import { requireRole } from '@/lib/auth/guards';
import { isUuid } from '@/lib/security/validate';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { RATE_LIMIT_MESSAGE, checkRateLimit } from '@/lib/security/rate-limit';
import { proofOfDeliverySchema, reportDeliveryFailedSchema } from '@/lib/driver/schemas';

import type { ProofOfDeliveryInput, ReportDeliveryFailedInput } from '@/lib/driver/schemas';
import type { ShipmentStatus } from '@/lib/types';

export type DriverActionResult = { success: true } | { success: false; error: string };

// Ownership (driver_id = auth.uid()) and transition legality (the
// shipment_status_transitions table + trigger) are both re-checked by the
// database regardless of what this action does — this is a convenience
// wrapper, not the security boundary.
const getOwnShipmentOrError = async (shipmentId: string, driverId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('shipments')
    .select('id, driver_id, status')
    .eq('id', shipmentId)
    .maybeSingle();

  if (!data || data.driver_id !== driverId) return null;
  return data;
};

export const acceptShipmentAction = async (shipmentId: string): Promise<DriverActionResult> => {
  if (!isUuid(shipmentId)) return { success: false, error: 'Not found' };
  const profile = await requireRole('driver');
  const shipment = await getOwnShipmentOrError(shipmentId, profile.id);
  if (!shipment) return { success: false, error: 'Shipment not found' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('shipments')
    .update({ status: 'driver_accepted' })
    .eq('id', shipmentId);

  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true };
};

export const declineShipmentAction = async (shipmentId: string): Promise<DriverActionResult> => {
  if (!isUuid(shipmentId)) return { success: false, error: 'Not found' };
  await requireRole('driver');
  const supabase = await createClient();

  // decline_shipment_assignment (migration 0013) is SECURITY DEFINER —
  // it's the only way driver_id can be nulled out by the driver's own
  // session, since the ordinary shipments_update RLS policy requires the
  // new row to still reference the caller.
  const { error } = await supabase.rpc('decline_shipment_assignment', { p_shipment_id: shipmentId });
  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true };
};

// Covers every forward step a driver triggers themselves: arrived_pickup,
// picked_up, in_transit, arrived_destination. 'delivered' is deliberately
// NOT reachable through this — see submitProofOfDeliveryAction.
export const advanceShipmentStatusAction = async (
  shipmentId: string,
  nextStatus: Exclude<ShipmentStatus, 'delivered'>,
): Promise<DriverActionResult> => {
  if (!isUuid(shipmentId)) return { success: false, error: 'Not found' };
  const profile = await requireRole('driver');
  const shipment = await getOwnShipmentOrError(shipmentId, profile.id);
  if (!shipment) return { success: false, error: 'Shipment not found' };

  const supabase = await createClient();
  const { error } = await supabase.from('shipments').update({ status: nextStatus }).eq('id', shipmentId);

  if (error) return { success: false, error: 'Could not update status — check this is a valid next step' };
  return { success: true };
};

export const reportDeliveryFailedAction = async (
  input: ReportDeliveryFailedInput,
): Promise<DriverActionResult> => {
  const profile = await requireRole('driver');
  const parsed = reportDeliveryFailedSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const shipment = await getOwnShipmentOrError(parsed.data.shipmentId, profile.id);
  if (!shipment) return { success: false, error: 'Shipment not found' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('shipments')
    .update({ status: 'delivery_failed', delivery_failed_reason: parsed.data.reason })
    .eq('id', parsed.data.shipmentId);

  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true };
};

// Generation, storage, and delivery to the customer's notification feed
// all happen inside issue_delivery_otp() (migration 0015), so the code
// never passes through the driver's session. No SMS provider is
// configured in this build (see .env.example) — the in-app notification
// is the honest substitute until one is.
export const requestDeliveryOtpAction = async (shipmentId: string): Promise<DriverActionResult> => {
  if (!isUuid(shipmentId)) return { success: false, error: 'Not found' };
  await requireRole('driver');
  const supabase = await createClient();

  // Each code goes to the customer's inbox — cap re-sends so the feature
  // can't be used to flood them.
  if (!(await checkRateLimit('otpIssuePerShipment', shipmentId))) return { success: false, error: RATE_LIMIT_MESSAGE };

  const { error } = await supabase.rpc('issue_delivery_otp', { p_shipment_id: shipmentId });
  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true };
};

export type SubmitProofOfDeliveryResult = DriverActionResult;

// complete_delivery() (migration 0015) is the only path to 'delivered':
// it verifies the OTP/QR against the secrets table the driver can't read,
// confirms any photo/signature path really exists in this shipment's
// storage folder, then records proof and flips status atomically. This
// action is just input validation + a clear error message around it.
export const submitProofOfDeliveryAction = async (
  input: ProofOfDeliveryInput,
): Promise<SubmitProofOfDeliveryResult> => {
  await requireRole('driver');
  const parsed = proofOfDeliverySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { shipmentId, recipientName, photoPath, signaturePath, otpCode, qrToken, notes } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('complete_delivery', {
    p_shipment_id: shipmentId,
    p_recipient_name: recipientName,
    p_photo_path: photoPath ?? null,
    p_signature_path: signaturePath ?? null,
    p_otp: otpCode || null,
    p_qr_token: qrToken || null,
    p_notes: notes || null,
  });

  if (error) return { success: false, error: safeErrorMessage(error) };
  if (data === 'invalid_otp') return { success: false, error: 'Incorrect code. Check with the recipient and try again.' };

  return { success: true };
};

export const markCodCollectedAction = async (codTransactionId: string): Promise<DriverActionResult> => {
  if (!isUuid(codTransactionId)) return { success: false, error: 'Not found' };
  await requireRole('driver');
  const supabase = await createClient();

  const { error } = await supabase
    .from('cod_transactions')
    .update({ status: 'collected', collected_at: new Date().toISOString() })
    .eq('id', codTransactionId);

  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true };
};

export const recordDriverLocationAction = async (
  shipmentId: string,
  lat: number,
  lng: number,
): Promise<{ success: boolean }> => {
  if (!isUuid(shipmentId) || !Number.isFinite(lat) || !Number.isFinite(lng)) return { success: false };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { success: false };
  const profile = await requireRole('driver');
  const supabase = await createClient();

  const { error } = await supabase
    .from('driver_locations')
    .insert({ driver_id: profile.id, shipment_id: shipmentId, lat, lng });

  return { success: !error };
};

const AVAILABILITY_VALUES = ['available', 'busy', 'offline'] as const;

export const updateAvailabilityAction = async (
  availability: (typeof AVAILABILITY_VALUES)[number],
): Promise<DriverActionResult> => {
  const profile = await requireRole('driver');
  if (!AVAILABILITY_VALUES.includes(availability)) return { success: false, error: 'Invalid availability' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('driver_profiles')
    .update({ availability })
    .eq('profile_id', profile.id);

  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true };
};
