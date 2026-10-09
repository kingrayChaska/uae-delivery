'use server';

import { z } from '@/lib/zod';

import { requireRole } from '@/lib/auth/guards';
import { isUuid } from '@/lib/security/validate';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { logAuditEvent } from '@/lib/audit/log';
import { listAvailableDrivers } from '@/services/drivers/list-available-drivers';

export type DispatchActionResult = { success: true } | { success: false; error: string };

const markReturnedSchema = z.object({
  shipmentId: z.string().uuid(),
  reason: z.string().trim().min(1, 'operator.validation.reason').max(500, 'operator.validation.reasonTooLong'),
});

export const assignDriverAction = async (shipmentId: string, driverId: string): Promise<DispatchActionResult> => {
  if (!isUuid(shipmentId) || !isUuid(driverId)) return { success: false, error: 'operator.errors.notFound' };
  const profile = await requireRole('operator', 'manager');
  const supabase = await createClient();

  const { data: shipment } = await supabase
    .from('shipments')
    .select('id, status, driver_id, tracking_number')
    .eq('id', shipmentId)
    .maybeSingle();

  if (!shipment) return { success: false, error: 'operator.errors.shipmentNotFound' };
  if (shipment.status !== 'confirmed' || shipment.driver_id) {
    return { success: false, error: 'operator.errors.notAwaiting' };
  }

  // Compare-and-set: the update only lands while the shipment is still
  // unassigned, so a double-click or two staff racing past the check above
  // can't both assign — the second one matches no row and is rejected.
  const { data: updated, error } = await supabase
    .from('shipments')
    .update({ driver_id: driverId, status: 'assigned' })
    .eq('id', shipmentId)
    .eq('status', 'confirmed')
    .is('driver_id', null)
    .select('id');

  if (error) return { success: false, error: safeErrorMessage(error) };
  if (!updated?.length) return { success: false, error: 'operator.errors.assignmentChanged' };

  await logAuditEvent({
    actorId: profile.id,
    action: 'shipment.assign_driver',
    entityType: 'shipment',
    entityId: shipmentId,
    newValue: { driverId },
  });

  return { success: true };
};

// Scoped to shipments still 'assigned' (driver hasn't accepted yet) or
// 'delivery_failed' (a failed attempt being retried with someone else) —
// both are moves the state machine (shipment_status_transitions) already
// allows without adding new transition rows. Reassigning a shipment the
// original driver has already accepted and is en route on isn't
// supported here; that needs a human decision the DB shouldn't paper
// over with a self-service reassignment button.
//
// expectedDriverId is the driver the operator saw as current when they
// clicked. Every click used to be applied blindly (last write wins), so a
// few quick clicks on the list reassigned the shipment back and forth and
// left each driver along the way with a "New delivery assigned"
// notification. Now a request made against a stale view, or one that
// wouldn't change anything, is rejected instead of applied.
export const reassignDriverAction = async (
  shipmentId: string,
  newDriverId: string,
  expectedDriverId: string | null,
): Promise<DispatchActionResult> => {
  if (!isUuid(shipmentId) || !isUuid(newDriverId) || (expectedDriverId !== null && !isUuid(expectedDriverId))) {
    return { success: false, error: 'operator.errors.notFound' };
  }
  const profile = await requireRole('operator', 'manager');
  const supabase = await createClient();

  const { data: shipment } = await supabase
    .from('shipments')
    .select('id, status, driver_id, tracking_number')
    .eq('id', shipmentId)
    .maybeSingle();

  if (!shipment) return { success: false, error: 'operator.errors.shipmentNotFound' };
  if (!['assigned', 'delivery_failed'].includes(shipment.status)) {
    return { success: false, error: 'operator.errors.cannotReassign' };
  }
  if (shipment.driver_id !== expectedDriverId) {
    return { success: false, error: 'operator.errors.assignmentChanged' };
  }
  // Same driver is only meaningful as a retry after a failed attempt
  // (delivery_failed -> assigned); on an 'assigned' shipment it's a no-op.
  if (shipment.status === 'assigned' && shipment.driver_id === newDriverId) {
    return { success: false, error: 'operator.errors.alreadyAssigned' };
  }

  // Compare-and-set on the state checked above, so a concurrent change
  // (another operator, the driver accepting or declining) between the read
  // and this write makes it match no row rather than overwrite that change.
  let update = supabase
    .from('shipments')
    .update({ driver_id: newDriverId, status: 'assigned' })
    .eq('id', shipmentId)
    .eq('status', shipment.status);
  update = expectedDriverId === null ? update.is('driver_id', null) : update.eq('driver_id', expectedDriverId);
  const { data: updated, error } = await update.select('id');

  if (error) return { success: false, error: safeErrorMessage(error) };
  if (!updated?.length) return { success: false, error: 'operator.errors.assignmentChanged' };

  await logAuditEvent({
    actorId: profile.id,
    action: 'shipment.reassign_driver',
    entityType: 'shipment',
    entityId: shipmentId,
    oldValue: { driverId: shipment.driver_id },
    newValue: { driverId: newDriverId },
  });

  return { success: true };
};

export const markReturnedAction = async (input: { shipmentId: string; reason: string }): Promise<DispatchActionResult> => {
  const profile = await requireRole('operator', 'manager');
  const parsed = markReturnedSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'validation.invalid' };

  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from('shipments')
    .select('id, status, delivery_failed_reason')
    .eq('id', parsed.data.shipmentId)
    .maybeSingle();

  if (!shipment) return { success: false, error: 'operator.errors.shipmentNotFound' };
  if (shipment.status !== 'delivery_failed') {
    return { success: false, error: 'operator.errors.cannotMarkReturned' };
  }

  const { error } = await supabase
    .from('shipments')
    .update({ status: 'returned', delivery_failed_reason: parsed.data.reason })
    .eq('id', parsed.data.shipmentId);
  if (error) return { success: false, error: safeErrorMessage(error) };

  await logAuditEvent({
    actorId: profile.id,
    action: 'shipment.mark_returned',
    entityType: 'shipment',
    entityId: parsed.data.shipmentId,
    oldValue: { deliveryFailedReason: shipment.delivery_failed_reason },
    newValue: { deliveryFailedReason: parsed.data.reason, status: 'returned' },
  });

  return { success: true };
};

export const getAvailableDriversAction = async (pickup: { lat: number; lng: number }) => {
  await requireRole('operator', 'manager');
  return listAvailableDrivers(pickup);
};
