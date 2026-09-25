import type { ShipmentStatus } from '@/lib/types';

export type TrackingMilestone = {
  key: string;
  label: string;
  done: boolean;
};

const MILESTONES: { key: string; label: string; reachedAt: ShipmentStatus[] }[] = [
  {
    key: 'confirmed',
    label: 'Booking Confirmed',
    reachedAt: [
      'confirmed',
      'assigned',
      'driver_accepted',
      'arrived_pickup',
      'picked_up',
      'in_transit',
      'arrived_destination',
      'delivered',
    ],
  },
  {
    key: 'assigned',
    label: 'Driver Assigned',
    reachedAt: [
      'assigned',
      'driver_accepted',
      'arrived_pickup',
      'picked_up',
      'in_transit',
      'arrived_destination',
      'delivered',
    ],
  },
  {
    key: 'arrived_pickup',
    label: 'Driver Arrived',
    reachedAt: ['arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination', 'delivered'],
  },
  {
    key: 'picked_up',
    label: 'Parcel Picked Up',
    reachedAt: ['picked_up', 'in_transit', 'arrived_destination', 'delivered'],
  },
  {
    key: 'in_transit',
    label: 'In Transit',
    reachedAt: ['in_transit', 'arrived_destination', 'delivered'],
  },
  {
    key: 'delivered',
    label: 'Delivered',
    reachedAt: ['delivered'],
  },
];

// 'pending_payment' has no milestone of its own — nothing is confirmed yet.
const TERMINAL_NEGATIVE: Partial<Record<ShipmentStatus, string>> = {
  cancelled: 'This shipment was cancelled.',
  delivery_failed: 'The last delivery attempt failed.',
  returned: 'This shipment was returned to sender.',
};

export const getTrackingMilestones = (status: ShipmentStatus): TrackingMilestone[] => {
  return MILESTONES.map((milestone) => ({
    key: milestone.key,
    label: milestone.label,
    done: milestone.reachedAt.includes(status),
  }));
};

export const getTerminalNegativeMessage = (status: ShipmentStatus): string | null => {
  return TERMINAL_NEGATIVE[status] ?? null;
};
