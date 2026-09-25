import Link from 'next/link';

import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';

import type { Shipment } from '@/lib/types';

type ShipmentListItemProps = {
  shipment: Shipment;
  basePath?: string;
};

const ShipmentListItem = ({ shipment, basePath = '/dashboard/customer/deliveries' }: ShipmentListItemProps) => {
  return (
    <Link
      href={`${basePath}/${shipment.id}`}
      className="flex items-center justify-between gap-4 rounded-md border p-4 hover:bg-secondary/40"
    >
      <div className="min-w-0">
        <p className="font-brand-mono text-sm text-muted-foreground">{shipment.trackingNumber}</p>
        <p className="truncate text-sm">
          {shipment.pickup.formattedAddress} → {shipment.dropoff.formattedAddress}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-brand-mono text-sm">
          {shipment.currency} {shipment.price.toFixed(2)}
        </span>
        <ShipmentStatusBadge status={shipment.status} />
      </div>
    </Link>
  );
};

export default ShipmentListItem;
