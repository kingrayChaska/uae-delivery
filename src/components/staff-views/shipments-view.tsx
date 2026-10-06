import Link from 'next/link';
import { CircleAlert, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import Pagination from '@/components/dashboard/pagination';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import ShipmentCategoryTabs from '@/components/staff-views/shipment-category-tabs';
import { BatchListItem } from '@/components/bulk/batch-list';
import { listAllShipments } from '@/services/shipments/list-all-shipments';
import { listShipmentFeed } from '@/services/shipments/list-shipment-feed';
import { getBatchLabel } from '@/services/bulk/list-batches';

import type { StaffListViewProps } from '@/components/staff-views/types';
import type { ShipmentCategory } from '@/lib/shipment/categories';

type ShipmentsViewProps = StaffListViewProps & { batchId?: string | null; category?: ShipmentCategory };

// Either one bulk batch's shipments (?batch=<id>), or the categorised list:
// All / Individual / Merchant / Bulk (?type=), where each bulk booking is a
// single entry that opens to its own shipments.
const ShipmentsView = async ({ basePath, page, batchId = null, category = 'all' }: ShipmentsViewProps) => {
  const t = await getTranslations('operator.shipments');

  const header = (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Button asChild>
        <Link href={`${basePath}/shipments/new`}>{t('new')}</Link>
      </Button>
    </div>
  );

  if (batchId) {
    const [shipments, batch] = await Promise.all([listAllShipments(page, { batchId }), getBatchLabel(batchId)]);
    const listHref = batch ? `${basePath}/shipments?batch=${batch.id}` : `${basePath}/shipments`;
    return (
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        {header}
        {batch ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('filteredBy')}</span>
            <Link href={`${basePath}/bulk/${batch.id}`} className="rounded-md bg-secondary px-2 py-1 hover:underline">
              <span dir="ltr" className="font-brand-mono">
                {batch.reference}
              </span>
              {batch.sender ? <span className="text-muted-foreground"> · {batch.sender}</span> : null}
            </Link>
            <Link href={`${basePath}/shipments`} className="inline-flex items-center gap-1 text-muted-foreground hover:underline">
              <X className="size-3.5" aria-hidden />
              {t('clearFilter')}
            </Link>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">{t('total', { count: shipments.total })}</p>
        {shipments.items.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="font-medium">{t('empty')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {shipments.items.map((shipment) => (
              <ShipmentListItem key={shipment.id} shipment={shipment} basePath={`${basePath}/shipments`} showBookedAt />
            ))}
          </div>
        )}
        <Pagination page={shipments.page} totalPages={shipments.totalPages} href={listHref} />
      </main>
    );
  }

  const listHref = category === 'all' ? `${basePath}/shipments` : `${basePath}/shipments?type=${category}`;
  const feed = await listShipmentFeed(page, category).catch((error: unknown) => {
    console.error('Staff shipment list failed', error instanceof Error ? error.message : error);
    return null;
  });

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      {header}
      <ShipmentCategoryTabs basePath={basePath} current={category} />

      {feed === null ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {t('loadError')}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={listHref}>{t('retry')}</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {category === 'bulk' ? t('totalBulk', { count: feed.total }) : t('totalEntries', { count: feed.total })}
          </p>
          {feed.items.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="font-medium">{t(`emptyCategory.${category}`)}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {feed.items.map((item) =>
                item.kind === 'batch' ? (
                  <BatchListItem key={`batch-${item.batch.id}`} batch={item.batch} hrefBase={`${basePath}/bulk`} showSender />
                ) : (
                  <ShipmentListItem key={item.shipment.id} shipment={item.shipment} basePath={`${basePath}/shipments`} showBookedAt />
                ),
              )}
            </div>
          )}
          <Pagination page={feed.page} totalPages={feed.totalPages} href={listHref} />
        </>
      )}
    </main>
  );
};

export default ShipmentsView;
