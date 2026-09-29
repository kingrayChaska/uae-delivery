import Link from 'next/link';
import { useTranslations } from 'next-intl';

import BatchStatusBadge from '@/components/bulk/batch-status-badge';
import { bookingNameCount, formatPickupDate } from '@/lib/bulk/format';
import { useAppLocale, useFormat } from '@/i18n/hooks';

import type { BatchSummary } from '@/services/bulk/list-batches';

type BatchListProps = {
  batches: BatchSummary[];
  hrefBase: string;
  // Staff see who sent each list; a customer only ever sees their own.
  showSender?: boolean;
  emptyMessage?: string;
};

const BatchList = ({ batches, hrefBase, showSender = false, emptyMessage }: BatchListProps) => {
  const t = useTranslations('operator.bulk');
  const locale = useAppLocale();
  const format = useFormat();
  if (batches.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="font-medium">{emptyMessage ?? t('empty')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {batches.map((batch) => (
        <Link
          key={batch.id}
          href={`${hrefBase}/${batch.id}`}
          className="flex flex-col gap-3 rounded-md border p-4 hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p dir="ltr" className="font-brand-mono text-sm text-muted-foreground rtl:text-right">
              {batch.reference}
            </p>
            <p className="truncate font-medium">
              {bookingNameCount(batch.name) !== null ? t('bookingOf', { count: bookingNameCount(batch.name)! }) : batch.name}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {showSender ? `${batch.companyName ?? batch.customer.fullName} · ` : ''}
              {t('pickup', { date: batch.pickupDate ? formatPickupDate(batch.pickupDate, locale) : t('noDate') })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-brand-mono">{t('counts', { shipments: batch.shipmentCount, items: batch.parcelCount })}</span>
            <span className="font-brand-mono">{format.money(batch.totalPrice, batch.currency)}</span>
            {batch.progress.awaitingDispatch > 0 ? (
              <span className="text-muted-foreground">{t('awaiting', { count: batch.progress.awaitingDispatch })}</span>
            ) : null}
            <BatchStatusBadge status={batch.status} />
          </div>
        </Link>
      ))}
    </div>
  );
};

export default BatchList;
