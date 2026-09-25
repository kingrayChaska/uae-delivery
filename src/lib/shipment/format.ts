import type { ShipmentStatus } from '@/lib/types';

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending_payment: 'Pending Payment',
  confirmed: 'Confirmed',
  assigned: 'Driver Assigned',
  driver_accepted: 'Driver Accepted',
  arrived_pickup: 'Driver at Pickup',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  arrived_destination: 'Arrived at Destination',
  delivered: 'Delivered',
  delivery_failed: 'Delivery Failed',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const formatShipmentStatus = (status: ShipmentStatus) => STATUS_LABELS[status];

export const formatEta = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
};
