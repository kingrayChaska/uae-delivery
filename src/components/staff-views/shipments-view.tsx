import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CircleAlert, PackageSearch, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import Pagination from '@/components/dashboard/pagination';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import ShipmentFilters from '@/components/shipment/shipment-filters';
import ShipmentCategoryTabs from '@/components/staff-views/shipment-category-tabs';
import { BatchListItem } from '@/components/bulk/batch-list';
import { todayInUae } from '@/lib/bulk/schemas';
import { NO_FILTERS, hasFilters, shipmentListHref } from '@/lib/shipment/filters';
import { listAllShipments, searchStaffShipments } from '@/services/shipments/list-all-shipments';
import { listShipmentFeed } from '@/services/shipments/list-shipment-feed';
import { getBatchLabel } from '@/services/bulk/list-batches';

import type { StaffListViewProps } from '@/components/staff-views/types';
import type { ShipmentCategory } from '@/lib/shipment/categories';
import type { ShipmentFilters as Filters } from '@/lib/shipment/filters';

type ShipmentsViewProps = StaffListViewProps & {
  batchId?: string | null;
  category?: ShipmentCategory;
  filters?: Filters;
};

// Either one bulk batch's shipments (?batch=<id>), or the categorised list:
// All / Individual / Merchant / Bulk (?type=), where each bulk booking is a
// single entry that opens to its own shipments. Searching or filtering
// (?q=&status=&from=&to=, as on the merchant and driver lists) lists the
// matching shipments one by one instead, within the tab or batch.
const ShipmentsView = async ({ basePath, page, batchId = null, category = 'all', filters = NO_FILTERS }: ShipmentsViewProps) => {
  const t = await getTranslations('operator.shipments');
  const listPath = `${basePath}/shipments`;
  // The tab or batch isn't a filter: kept through searching, clearing and paging.
  const keep: Record<string, string> = batchId ? { batch: batchId } : category === 'all' ? {} : { type: category };
  const filtered = hasFilters(filters);

  const [batch, results] = await Promise.all([
    batchId ? getBatchLabel(batchId) : Promise.resolve(null),
    filtered
      ? searchStaffShipments(page, filters, { category, batchId }).catch((error: unknown) => {
          console.error('Staff shipment search failed', error instanceof Error ? error.message : error);
          return null;
        })
      : Promise.resolve(undefined),
  ]);
  // Past the last page of matches: back to the first.
  if (results && results.items.length === 0 && page > 1) redirect(shipmentListHref(listPath, filters, 1, keep));

  const header = (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={`${basePath}/shipments/new?for=guest`}>{t('newForGuest')}</Link>
        </Button>
        <Button asChild>
          <Link href={`${basePath}/shipments/new`}>{t('new')}</Link>
        </Button>
      </div>
    </div>
  );

  const loadError = (retryHref: string, message: string) => (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-destructive">
        <CircleAlert className="size-4 shrink-0" aria-hidden />
        {message}
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href={retryHref}>{t('retry')}</Link>
      </Button>
    </div>
  );

  const shipmentRows = (items: Awaited<ReturnType<typeof listAllShipments>>['items']) => (
    <div className="flex flex-col gap-2">
      {items.map((shipment) => (
        <ShipmentListItem key={shipment.id} shipment={shipment} basePath={listPath} showBookedAt showRecipientName />
      ))}
    </div>
  );

  let list: React.ReactNode;
  if (results === null) {
    list = loadError(shipmentListHref(listPath, filters, page, keep), t('filters.error'));
  } else if (results) {
    list = (
      <>
        <p role="status" className="text-sm text-muted-foreground">
          {t('filters.results', { count: results.total })}
        </p>
        {results.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
            <PackageSearch className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">{t('filters.empty')}</p>
            <Button asChild variant="outline">
              <Link href={shipmentListHref(listPath, {}, 1, keep)}>
                <X aria-hidden />
                {t('filters.clear')}
              </Link>
            </Button>
          </div>
        ) : (
          shipmentRows(results.items)
        )}
        <Pagination page={results.page} totalPages={results.totalPages} href={shipmentListHref(listPath, filters, 1, keep)} />
      </>
    );
  } else if (batchId) {
    const shipments = await listAllShipments(page, { batchId });
    list = (
      <>
        <p className="text-sm text-muted-foreground">{t('total', { count: shipments.total })}</p>
        {shipments.items.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="font-medium">{t('empty')}</p>
          </div>
        ) : (
          shipmentRows(shipments.items)
        )}
        <Pagination page={shipments.page} totalPages={shipments.totalPages} href={shipmentListHref(listPath, {}, 1, keep)} />
      </>
    );
  } else {
    const feed = await listShipmentFeed(page, category).catch((error: unknown) => {
      console.error('Staff shipment list failed', error instanceof Error ? error.message : error);
      return null;
    });
    list =
      feed === null ? (
        loadError(shipmentListHref(listPath, {}, page, keep), t('loadError'))
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
                  <ShipmentListItem key={item.shipment.id} shipment={item.shipment} basePath={listPath} showBookedAt showRecipientName />
                ),
              )}
            </div>
          )}
          <Pagination page={feed.page} totalPages={feed.totalPages} href={shipmentListHref(listPath, {}, 1, keep)} />
        </>
      );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      {header}
      {batchId ? (
        batch ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('filteredBy')}</span>
            <Link href={`${basePath}/bulk/${batch.id}`} className="rounded-md bg-secondary px-2 py-1 hover:underline">
              <span dir="ltr" className="font-brand-mono">
                {batch.reference}
              </span>
              {batch.sender ? <span className="text-muted-foreground"> · {batch.sender}</span> : null}
            </Link>
            <Link href={shipmentListHref(listPath, filters)} className="inline-flex items-center gap-1 text-muted-foreground hover:underline">
              <X className="size-3.5" aria-hidden />
              {t('clearFilter')}
            </Link>
          </div>
        ) : null
      ) : (
        <ShipmentCategoryTabs basePath={basePath} current={category} filters={filters} />
      )}
      <ShipmentFilters basePath={listPath} filters={filters} messages="operator.shipments.filters" today={todayInUae()} keep={keep} />
      {list}
    </main>
  );
};

export default ShipmentsView;
