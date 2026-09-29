import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';

import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import { DELIVERY_TYPE_COPY } from '@/lib/pricing/config';

import type { Shipment } from '@/lib/types';

type ShipmentListItemProps = {
  shipment: Shipment;
  basePath?: string;
};

const ShipmentListItem = ({ shipment, basePath = '/dashboard/customer/deliveries' }: ShipmentListItemProps) => {
  return (
    <Link
      href={`${basePath}/${shipment.id}`}
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-all duration-150 hover:border-primary/30 hover:bg-secondary/30 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-brand-mono text-sm font-semibold tracking-wider">{shipment.trackingNumber}</span>
          <span className="text-xs text-muted-foreground">{DELIVERY_TYPE_COPY[shipment.deliveryType].label}</span>
          {shipment.recipientPaymentType === 'postpaid' ? (
            <span className="text-xs text-muted-foreground">
              · COD {shipment.currency} {shipment.codAmount.toFixed(2)}
            </span>
          ) : null}
        </div>
        <p className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="truncate">{shipment.pickup.formattedAddress}</span>
          <ArrowRight className="size-3.5 shrink-0 text-primary" aria-label="to" />
          <span className="truncate">{shipment.dropoff.formattedAddress}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="font-brand-mono text-sm font-medium">
          {shipment.currency} {shipment.price.toFixed(2)}
        </span>
        <ShipmentStatusBadge status={shipment.status} />
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden
      />
    </Link>
  );
};

export default ShipmentListItem;
