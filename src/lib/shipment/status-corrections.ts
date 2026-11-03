import { z } from '@/lib/zod';

import { SHIPMENT_STATUSES } from '@/lib/types';

import type { ShipmentStatus } from '@/lib/types';

// Operators and managers correcting a status a driver set by mistake
// (migrations 0041 and 0057). The database function enforces lifecycle
// requirements for each target status.

// A correction can restore any canonical status. The database enforces
// lifecycle-specific requirements such as an assigned driver or delivery proof.
export const CORRECTION_TARGETS: readonly ShipmentStatus[] = SHIPMENT_STATUSES;

export const correctionTargets = (
  from: ShipmentStatus,
  { hasDriver }: { isManager: boolean; hasDriver: boolean },
): ShipmentStatus[] => {
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
