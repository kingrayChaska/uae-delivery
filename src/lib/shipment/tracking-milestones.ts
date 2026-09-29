import type { ShipmentStatus } from '@/lib/types';

export type TrackingMilestone = {
  key: string;
  label: string;
  description: string;
  done: boolean;
  // True for the most recent completed milestone.
  current: boolean;
  // When the shipment first reached this milestone, if the history has it.
  reachedAt: string | null;
};

type MilestoneDefinition = {
  key: string;
  label: string;
  description: string;
  // Statuses at which this milestone counts as reached.
  reachedAt: ShipmentStatus[];
  // Statuses whose history entry marks the moment it was reached.
  enteredBy: ShipmentStatus[];
};

const AFTER_PICKUP: ShipmentStatus[] = ['picked_up', 'in_transit', 'arrived_destination', 'delivered'];

// Built on the existing shipment status state machine (migration 0006) —
// the customer sees six plain-language steps instead of twelve statuses.
const MILESTONES: MilestoneDefinition[] = [
  {
    key: 'created',
    label: 'Booking created',
    description: 'We have your booking.',
    reachedAt: ['pending_payment', 'confirmed', 'assigned', 'driver_accepted', 'arrived_pickup', ...AFTER_PICKUP],
    enteredBy: ['pending_payment', 'confirmed'],
  },
  {
    key: 'assigned',
    label: 'Driver assigned',
    description: 'A driver is on the way to collect it.',
    reachedAt: ['assigned', 'driver_accepted', 'arrived_pickup', ...AFTER_PICKUP],
    enteredBy: ['assigned'],
  },
  {
    key: 'received',
    label: 'Shipment received',
    description: 'The driver has collected your parcel.',
    reachedAt: AFTER_PICKUP,
    enteredBy: ['picked_up'],
  },
  {
    key: 'in_transit',
    label: 'In transit',
    description: 'On the road to the recipient.',
    reachedAt: ['in_transit', 'arrived_destination', 'delivered'],
    enteredBy: ['in_transit'],
  },
  {
    key: 'out_for_delivery',
    label: 'Out for delivery',
    description: 'The driver is at the delivery address.',
    reachedAt: ['arrived_destination', 'delivered'],
    enteredBy: ['arrived_destination'],
  },
  {
    key: 'delivered',
    label: 'Delivered',
    description: 'Handed over to the recipient.',
    reachedAt: ['delivered'],
    enteredBy: ['delivered'],
  },
];

const TERMINAL_NEGATIVE: Partial<Record<ShipmentStatus, string>> = {
  cancelled: 'This shipment was cancelled.',
  delivery_failed: 'The last delivery attempt failed. Our team will be in touch to arrange another attempt.',
  returned: 'This shipment was returned to the sender.',
};

export const getTrackingMilestones = (
  status: ShipmentStatus,
  history: { status: ShipmentStatus; createdAt: string }[] = [],
): TrackingMilestone[] => {
  const firstReached = (statuses: ShipmentStatus[]) =>
    history.find((entry) => statuses.includes(entry.status))?.createdAt ?? null;

  // A cancelled, failed or returned shipment still shows how far it got.
  const stopped = status in TERMINAL_NEGATIVE;
  const milestones = MILESTONES.map((milestone) => {
    const reachedAt = firstReached(milestone.enteredBy);
    const done = milestone.reachedAt.includes(status) || (stopped && (reachedAt !== null || milestone.key === 'created'));
    return {
      key: milestone.key,
      label: milestone.label,
      description: milestone.description,
      done,
      current: false,
      reachedAt: done ? reachedAt : null,
    };
  });

  let lastDone = -1;
  milestones.forEach((milestone, index) => {
    if (milestone.done) lastDone = index;
  });
  if (lastDone >= 0 && !stopped) milestones[lastDone].current = true;
  return milestones;
};

export const getTerminalNegativeMessage = (status: ShipmentStatus): string | null => {
  return TERMINAL_NEGATIVE[status] ?? null;
};
