import Badge from '@/components/ui/badge';
import { formatShipmentStatus } from '@/lib/shipment/format';

import type { ShipmentStatus } from '@/lib/types';

const STATUS_VARIANT: Record<ShipmentStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  pending_payment: 'secondary',
  confirmed: 'default',
  assigned: 'default',
  driver_accepted: 'default',
  arrived_pickup: 'default',
  picked_up: 'default',
  in_transit: 'default',
  arrived_destination: 'default',
  delivered: 'success',
  delivery_failed: 'destructive',
  cancelled: 'destructive',
  returned: 'warning',
};

const ShipmentStatusBadge = ({ status }: { status: ShipmentStatus }) => {
  return <Badge variant={STATUS_VARIANT[status]}>{formatShipmentStatus(status)}</Badge>;
};

export default ShipmentStatusBadge;
