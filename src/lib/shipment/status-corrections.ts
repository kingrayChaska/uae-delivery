import { z } from '@/lib/zod';

import { SHIPMENT_STATUSES } from '@/lib/types';

import type { ShipmentStatus } from '@/lib/types';

// Operators apply one of four administrative outcomes; Pending is represented
// by the app's confirmed, unassigned dispatch-queue status.
export const OPERATOR_CORRECTION_OPTIONS = [
  { status: 'confirmed', label: 'pending' },
  { status: 'cancelled', label: 'cancel' },
  { status: 'delivered', label: 'delivered' },
  { status: 'returned', label: 'returned' },
] as const satisfies readonly { status: ShipmentStatus; label: string }[];

// Managers retain the existing full status-correction behavior. The database
// independently enforces role permissions and the manager lifecycle rules.
export const CORRECTION_TARGETS: readonly ShipmentStatus[] = SHIPMENT_STATUSES;

export const correctionTargets = (
  from: ShipmentStatus,
  { isManager, hasDriver }: { isManager: boolean; hasDriver: boolean },
): ShipmentStatus[] => {
  if (!isManager) {
    return OPERATOR_CORRECTION_OPTIONS.map(({ status }) => status);
  }

  const driverStatuses: ShipmentStatus[] = [
    'assigned',
    'driver_accepted',
    'arrived_pickup',
    'picked_up',
    'in_transit',
    'arrived_destination',
    'delivered',
    'delivery_failed',
  ];
  return SHIPMENT_STATUSES.filter(
    (status) => status !== from && (hasDriver || !driverStatuses.includes(status)),
  );
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
