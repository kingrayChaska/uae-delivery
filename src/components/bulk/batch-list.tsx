import Link from 'next/link';
import { useTranslations } from 'next-intl';

import BatchStatusBadge from '@/components/bulk/batch-status-badge';
import { bookingNameCount, formatPickupDate } from '@/lib/bulk/format';
import { useAppLocale, useFormat } from '@/i18n/hooks';

import type { BatchSummary } from '@/services/bulk/list-batches';

type BatchListItemProps = {
  batch: BatchSummary;
  hrefBase: string;
  // Staff see who sent each list; a customer only ever sees their own.
  showSender?: boolean;
};

// One batch as a single row: reference, who sent it, its shipment count,
// total and status. Also used for bulk entries in the staff shipments list.
export const BatchListItem = ({ batch, hrefBase, showSender = false }: BatchListItemProps) => {
  const t = useTranslations('operator.bulk');
  const locale = useAppLocale();
  const format = useFormat();
  const count = bookingNameCount(batch.name);

  return (
    <Link
      href={`${hrefBase}/${batch.id}`}
      className="flex flex-col gap-3 rounded-md border p-4 hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p dir="ltr" className="font-brand-mono text-sm text-muted-foreground rtl:text-right">
          {batch.reference}
        </p>
        <p className="truncate font-medium">{count !== null ? t('bookingOf', { count }) : batch.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {showSender ? `${batch.companyName ?? batch.customer.fullName} · ` : ''}
          {t('pickup', { date: batch.pickupDate ? formatPickupDate(batch.pickupDate, locale) : t('noDate') })}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {batch.status === 'draft' ? (
          // An upload still under review: no shipments yet.
          <span className="font-brand-mono">{t('draftRows', { count: batch.rowsSubmitted })}</span>
        ) : (
          <>
            <span className="font-brand-mono">{t('counts', { shipments: batch.shipmentCount, items: batch.parcelCount })}</span>
            <span className="font-brand-mono">{format.money(batch.totalPrice, batch.currency)}</span>
          </>
        )}
        {batch.progress.awaitingDispatch > 0 ? (
          <span className="text-muted-foreground">{t('awaiting', { count: batch.progress.awaitingDispatch })}</span>
        ) : null}
        <BatchStatusBadge status={batch.status} />
      </div>
    </Link>
  );
};

type BatchListProps = {
  batches: BatchSummary[];
  hrefBase: string;
  showSender?: boolean;
  emptyMessage?: string;
};

const BatchList = ({ batches, hrefBase, showSender = false, emptyMessage }: BatchListProps) => {
  const t = useTranslations('operator.bulk');
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
        <BatchListItem key={batch.id} batch={batch} hrefBase={hrefBase} showSender={showSender} />
      ))}
    </div>
  );
};

export default BatchList;
