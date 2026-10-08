import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import { useFormat } from '@/i18n/hooks';

import type { Shipment } from '@/lib/types';

type ShipmentListItemProps = {
  shipment: Shipment;
  basePath?: string;
  // Staff lists show when each shipment was booked.
  showBookedAt?: boolean;
  // Merchants use the recipient to identify individual business shipments.
  showRecipientName?: boolean;
};

const ShipmentListItem = ({
  shipment,
  basePath = '/dashboard/customer/deliveries',
  showBookedAt = false,
  showRecipientName = false,
}: ShipmentListItemProps) => {
  const t = useTranslations('shipments');
  const format = useFormat();
  return (
    <Link
      href={`${basePath}/${shipment.id}`}
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-all duration-150 hover:border-primary/30 hover:bg-secondary/30 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span dir="ltr" className="font-brand-mono text-sm font-semibold tracking-wider">{shipment.trackingNumber}</span>
          {showRecipientName ? (
            <span className="max-w-full break-words text-sm font-semibold text-foreground">
              {shipment.dropoff.contactName.trim() || t('list.recipientNotProvided')}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">{t(`deliveryType.${shipment.deliveryType}.label`)}</span>
          {showBookedAt ? (
            <time dateTime={shipment.createdAt} className="text-xs text-muted-foreground">
              {t('list.bookedOn', { date: format.dateTime(shipment.createdAt) })}
            </time>
          ) : null}
          {shipment.deliveryDate ? (
            <span className="text-xs text-muted-foreground">{t('detail.deliverOn', { date: format.calendarDate(shipment.deliveryDate) })}</span>
          ) : null}
          {shipment.batchReference ? (
            <span dir="ltr" className="rounded-md bg-secondary px-1.5 py-0.5 font-brand-mono text-[0.6875rem] text-secondary-foreground">
              {shipment.batchReference}
            </span>
          ) : null}
          {shipment.recipientPaymentType === 'postpaid' ? (
            <span className="text-xs text-muted-foreground">
              {t('list.cod', { amount: format.money(shipment.codAmount, shipment.currency) })}
            </span>
          ) : null}
        </div>
        <p className="flex min-w-0 items-center gap-1.5 text-sm">
          {/* dir="auto": addresses are English map data; in Arabic they
              must still cut off at their own end ("Dubai Mall, Fin…"). */}
          <span dir="auto" className="truncate">{shipment.pickup.formattedAddress}</span>
          <ArrowRight className="size-3.5 shrink-0 text-primary rtl:rotate-180" aria-label={t('list.to')} />
          <span dir="auto" className="truncate">{shipment.dropoff.formattedAddress}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="font-brand-mono text-sm font-medium">{format.money(shipment.price, shipment.currency)}</span>
        <ShipmentStatusBadge status={shipment.status} />
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
};

export default ShipmentListItem;
