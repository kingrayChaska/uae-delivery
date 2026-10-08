import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CircleAlert, PackageSearch, RotateCw, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import Pagination from '@/components/dashboard/pagination';
import ShipmentFilters from '@/components/shipment/shipment-filters';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { todayInUae } from '@/lib/bulk/schemas';
import { DRIVER_STATUS_FILTERS, hasFilters, parseShipmentFilters, shipmentListHref } from '@/lib/shipment/filters';
import { listDriverActiveShipments, searchDriverShipments } from '@/services/shipments/list-driver-shipments';

import type { Metadata } from 'next';
import type { Paginated } from '@/lib/pagination';
import type { Shipment } from '@/lib/types';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('driver.deliveries'))('meta'),
});

const BASE_PATH = '/dashboard/driver/deliveries';

const DriverDeliveriesPage = async ({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    q?: string | string[];
    status?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}) => {
  const profile = await requireRoleOrRedirect('driver');
  const params = await searchParams;
  // Search, status and booking date from the URL, as on the customer list.
  // No ?scope=: a driver's only list is their own assignments.
  const filters = { ...parseShipmentFilters(params, DRIVER_STATUS_FILTERS), scope: 'mine' as const };
  const filtered = hasFilters(filters);
  const page = parsePage(params.page);
  const t = await getTranslations('driver.deliveries');

  // Unfiltered: the work in hand, as before. Filtered: every shipment
  // assigned to this driver, matched and paged in the database.
  let active: Shipment[] = [];
  let results: Paginated<Shipment> | null = null;
  let failed = false;
  if (filtered) {
    try {
      results = await searchDriverShipments(page, filters);
    } catch {
      failed = true;
    }
  } else {
    active = await listDriverActiveShipments(profile.id);
  }
  // Past the last page of matches: back to the first.
  if (results && results.items.length === 0 && page > 1) redirect(shipmentListHref(BASE_PATH, filters));

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <ShipmentFilters
        basePath={BASE_PATH}
        filters={filters}
        messages="driver.deliveries.filters"
        statuses={DRIVER_STATUS_FILTERS}
        today={todayInUae()}
        collapsible
      />

      {failed ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 p-8 text-center">
          <CircleAlert className="size-8 text-destructive" aria-hidden />
          <p className="font-medium">{t('filters.error')}</p>
          <Button asChild variant="outline">
            <Link href={shipmentListHref(BASE_PATH, filters, page)}>
              <RotateCw aria-hidden />
              {t('filters.retry')}
            </Link>
          </Button>
        </div>
      ) : results ? (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {t('filters.results', { count: results.total })}
          </p>
          {results.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
              <PackageSearch className="size-8 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">{t('filters.empty')}</p>
                <p className="text-sm text-muted-foreground">{t('filters.emptyHint')}</p>
              </div>
              <Button asChild variant="outline">
                <Link href={BASE_PATH}>
                  <X aria-hidden />
                  {t('filters.clear')}
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {results.items.map((shipment) => (
                <ShipmentListItem key={shipment.id} shipment={shipment} basePath={BASE_PATH} />
              ))}
            </div>
          )}
          <Pagination page={results.page} totalPages={results.totalPages} href={shipmentListHref(BASE_PATH, filters)} />
        </>
      ) : active.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('emptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath={BASE_PATH} />
          ))}
        </div>
      )}
    </main>
  );
};

export default DriverDeliveriesPage;
