import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/stat-card';
import Pagination from '@/components/dashboard/pagination';
import BatchStatusBadge from '@/components/bulk/batch-status-badge';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { bookingNameCount, formatPickupDate } from '@/lib/bulk/format';
import { useAppLocale, useFormat, useMessage } from '@/i18n/hooks';

import type { ReactNode } from 'react';
import type { BatchDetail as BatchDetailData } from '@/services/bulk/list-batches';

type BatchDetailProps = {
  batch: BatchDetailData;
  backHref: string;
  shipmentBasePath: string;
  // Staff get the sender's contact details; the customer already knows them.
  showSender?: boolean;
  // Merchants can identify each shipment by its recipient.
  showRecipientName?: boolean;
  // This page's own path, for paging through the shipments.
  pageHref: string;
  // Extra buttons beside the status (e.g. the merchant's report download).
  actions?: ReactNode;
  backLabel?: string;
};

const BatchDetail = ({
  batch,
  backHref,
  shipmentBasePath,
  showSender = false,
  showRecipientName = false,
  pageHref,
  actions,
  backLabel,
}: BatchDetailProps) => {
  const t = useTranslations('operator.bulk');
  const locale = useAppLocale();
  const format = useFormat();
  const translate = useMessage();
  const count = bookingNameCount(batch.name);
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <Link href={backHref} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {backLabel ?? t('back')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p dir="ltr" className="font-brand-mono text-sm text-muted-foreground rtl:text-right">
            {batch.reference}
          </p>
          <h1 className="text-2xl font-semibold">{count !== null ? t('bookingOf', { count }) : batch.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t('submitted', {
              date: format.dateTime(batch.createdAt),
              pickup: batch.pickupDate ? formatPickupDate(batch.pickupDate, locale) : t('noDate'),
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <BatchStatusBadge status={batch.status} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('detailStats.shipments')}
          value={t('detailStats.shipmentsValue', { shipments: format.number(batch.shipmentCount), items: format.number(batch.parcelCount) })}
        />
        <StatCard label={t('detailStats.awaiting')} value={format.number(batch.progress.awaitingDispatch)} />
        <StatCard
          label={t('detailStats.progress')}
          value={`${format.number(batch.progress.inProgress)} / ${format.number(batch.progress.delivered)}`}
        />
        <StatCard label={t('detailStats.total')} value={format.money(batch.totalPrice, batch.currency)} />
      </div>

      {batch.shipmentCount > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            {(['delivered', 'inProgress', 'awaitingDispatch', 'issues'] as const).map((key) => (
              <span
                key={key}
                className={{ delivered: 'bg-success', inProgress: 'bg-primary', awaitingDispatch: 'bg-muted-foreground/40', issues: 'bg-destructive' }[key]}
                style={{ width: `${(batch.progress[key] / batch.shipmentCount) * 100}%` }}
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('progressLine', {
              delivered: format.number(batch.progress.delivered),
              inProgress: format.number(batch.progress.inProgress),
              awaiting: format.number(batch.progress.awaitingDispatch),
              issues: format.number(batch.progress.issues),
            })}
          </p>
        </div>
      ) : null}

      {showSender || batch.notes ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6 text-sm">
            {showSender ? (
              <div>
                <p className="text-xs text-muted-foreground">{t('sender')}</p>
                <p className="font-medium">{batch.companyName ?? batch.customer.fullName}</p>
                <p className="text-muted-foreground">
                  {batch.companyName ? `${batch.customer.fullName} · ` : ''}
                  {[batch.customer.email, batch.customer.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
            ) : null}
            {batch.notes ? (
              <div>
                <p className="text-xs text-muted-foreground">{t('notes')}</p>
                <p className="whitespace-pre-line">{batch.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {batch.failedRows.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">{t('failedRows', { count: batch.failedRows.length })}</h2>
          <ul className="flex flex-col divide-y rounded-md border text-sm">
            {batch.failedRows.map((row) => (
              <li key={row.rowNumber} className="flex gap-4 px-3 py-2">
                <span className="shrink-0 font-brand-mono text-xs text-muted-foreground">{t('row', { number: row.rowNumber })}</span>
                <span className="text-destructive">{translate(row.message)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">{t('shipments')}</h2>
        {batch.status === 'processing' ? <p className="text-sm text-muted-foreground">{t('processing')}</p> : null}
        {batch.shipments.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('none')}</p>
        ) : (
          batch.shipments.items.map((shipment) => (
            <ShipmentListItem
              key={shipment.id}
              shipment={shipment}
              basePath={shipmentBasePath}
              showRecipientName={showRecipientName}
            />
          ))
        )}
        <Pagination page={batch.shipments.page} totalPages={batch.shipments.totalPages} href={pageHref} />
      </div>
    </main>
  );
};

export default BatchDetail;
