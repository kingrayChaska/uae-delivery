import { z } from '@/lib/zod';

import { SHIPMENT_STATUSES } from '@/lib/types';

import type { ShipmentStatus } from '@/lib/types';

// Operators and managers correcting a status a driver set by mistake
// (migration 0041). The database function correct_shipment_status() and
// shipment_status_correction_targets() are the rule; this mirrors it so the
// form only offers moves the database will accept.

// The driver-workflow statuses a correction can land on, in workflow order.
export const CORRECTION_TARGETS: readonly ShipmentStatus[] = [
  'assigned',
  'driver_accepted',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
];

const CORRECTABLE: readonly ShipmentStatus[] = [...CORRECTION_TARGETS, 'delivery_failed'];
// Re-opening these is a manager's decision.
const MANAGER_ONLY: readonly ShipmentStatus[] = ['cancelled', 'returned'];

export const correctionTargets = (
  from: ShipmentStatus,
  { isManager, hasDriver }: { isManager: boolean; hasDriver: boolean },
): ShipmentStatus[] => {
  if (!hasDriver) return [];
  if (!CORRECTABLE.includes(from) && !(isManager && MANAGER_ONLY.includes(from))) return [];
  return CORRECTION_TARGETS.filter((status) => status !== from);
};

export const statusCorrectionSchema = z.object({
  shipmentId: z.string().uuid(),
  // The status the operator was looking at: the database refuses the
  // correction if the shipment has moved on since.
  expectedStatus: z.enum(SHIPMENT_STATUSES),
  newStatus: z.enum(SHIPMENT_STATUSES),
  reason: z
    .string()
    .trim()
    .min(5, 'operator.validation.correctionReason')
    .max(500, 'operator.validation.reasonTooLong'),
});

export type StatusCorrectionInput = z.infer<typeof statusCorrectionSchema>;

export type StatusHistoryEvent = { status: ShipmentStatus; createdAt: string; eventType?: string | null };

// The path the shipment really took: status history with the steps a
// correction undid taken out. A correction back to a status the shipment
// had already reached returns the trail to that point (keeping when it was
// first reached); a correction to a status it never had is a step of its own.
export const effectiveStatusHistory = <T extends StatusHistoryEvent>(history: T[]): T[] => {
  const trail: T[] = [];
  for (const entry of history) {
    if (entry.eventType !== 'correction') {
      trail.push(entry);
      continue;
    }
    const reached = trail.map((step) => step.status).lastIndexOf(entry.status);
    if (reached >= 0) trail.splice(reached + 1);
    else trail.push(entry);
  }
  return trail;
};
