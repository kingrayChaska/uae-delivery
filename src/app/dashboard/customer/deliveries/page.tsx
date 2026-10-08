import Link from 'next/link';
import { CircleAlert, CircleCheck, PackagePlus, PackageSearch, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import Pagination from '@/components/dashboard/pagination';
import ShipmentFilters from '@/components/shipment/shipment-filters';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { isUuid } from '@/lib/security/validate';
import { sumPrices } from '@/lib/pricing/calculate';
import { hasFilters, parseShipmentFilters, shipmentListHref } from '@/lib/shipment/filters';
import { getCustomerBooking, listCustomerShipments } from '@/services/shipments/list-shipments';
import { getFormat } from '@/i18n/server';
import { getOwnMerchantApplication } from '@/services/merchant/applications';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('customer.deliveries'))('meta'),
});

const BASE_PATH = '/dashboard/customer/deliveries';

const DeliveriesPage = async ({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    booking?: string;
    booked?: string;
    failed?: string;
    scope?: string | string[];
    q?: string | string[];
    status?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}) => {
  const profile = await requireRoleOrRedirect('customer');
  const params = await searchParams;
  const bookingId = params.booking && isUuid(params.booking) ? params.booking : null;
  // Search, status and booking date, from the URL (the dashboard cards
  // link here with ?status=…); matched and paged in the database.
  // A merchant's business account — the one the merchant page's Shipments
  // card counts — unlocks the business-wide list (?scope=business). Anyone
  // else asking for it gets their own list (the database checks too).
  const application = profile.accountType === 'merchant' ? await getOwnMerchantApplication(profile.id) : null;
  const business = application?.businessAccountId ? { id: application.businessAccountId, name: application.companyName } : null;
  const parsed = parseShipmentFilters(params);
  const filters = parsed.scope === 'business' && !business ? { ...parsed, scope: 'mine' as const } : parsed;
  const filtered = hasFilters(filters);
  const [shipments, booking, t, tStatus, format] = await Promise.all([
    listCustomerShipments(profile.id, parsePage(params.page), filters, filters.scope === 'business' ? business!.id : null),
    bookingId ? getCustomerBooking(profile.id, bookingId) : Promise.resolve(null),
    getTranslations('customer.deliveries'),
    getTranslations('shipments.status'),
    getFormat(),
  ]);
  const failed = Number(params.failed ?? 0);
  const statusLabel =
    filters.status === 'all' ? null : filters.status === 'active' ? t('filters.active') : tStatus(filters.status);
  const narrowedFurther = filters.q !== '' || filters.from !== null || filters.to !== null;

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/customer/track">
              <PackageSearch aria-hidden />
              {t('track')}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/customer/book">
              <PackagePlus aria-hidden />
              {t('book')}
            </Link>
          </Button>
        </div>
      </div>

      {booking ? (
        <section
          aria-labelledby="booking-heading"
          className="flex flex-col gap-3 rounded-2xl border border-success/40 bg-success/5 p-4 sm:p-5 animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 id="booking-heading" className="flex items-center gap-2 font-semibold">
              <CircleCheck className="size-5 text-success" aria-hidden />
              {params.booked === '1'
                ? t('bookingConfirmed', { reference: booking.reference })
                : t('booking', { reference: booking.reference })}
            </h2>
            <span className="font-brand-mono text-sm font-medium">
              {t('bookingSummary', {
                count: booking.shipments.length,
                total: format.money(sumPrices(booking.shipments.map((s) => s.price))),
              })}
            </span>
          </div>
          {failed > 0 ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('failed', { count: failed })}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {booking.shipments.map((shipment) => (
              <ShipmentListItem key={shipment.id} shipment={shipment} showRecipientName={business !== null} />
            ))}
          </div>
        </section>
      ) : null}

      {business ? (
        <nav aria-label={t('scope.label')} className="flex flex-wrap gap-2">
          {(['mine', 'business'] as const).map((scope) => (
            <Link
              key={scope}
              href={shipmentListHref(BASE_PATH, { ...filters, scope })}
              aria-current={filters.scope === scope ? 'page' : undefined}
              className="inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
            >
              {scope === 'mine' ? t('scope.mine') : t('scope.business', { company: business.name })}
            </Link>
          ))}
        </nav>
      ) : null}

      <ShipmentFilters basePath={BASE_PATH} filters={filters} />

      {filtered ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t('filters.results', { count: shipments.total })}
        </p>
      ) : null}

      {shipments.items.length === 0 && filtered ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
          <PackageSearch className="size-8 text-muted-foreground" aria-hidden />
          {/* Name the status (e.g. from a dashboard card) so it's clear why the list is empty. */}
          <p className="font-medium">
            {statusLabel === null
              ? t('filters.empty')
              : narrowedFurther
                ? t('filters.emptyStatusFiltered', { status: statusLabel })
                : t('filters.emptyStatus', { status: statusLabel })}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {statusLabel !== null && narrowedFurther ? (
              <Button asChild variant="outline">
                <Link href={shipmentListHref(BASE_PATH, { scope: filters.scope, status: filters.status })}>
                  {t('filters.showStatus', { status: statusLabel })}
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={shipmentListHref(BASE_PATH, { scope: filters.scope })}>
                <X aria-hidden />
                {t('filters.clear')}
              </Link>
            </Button>
          </div>
        </div>
      ) : shipments.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
          <PackageSearch className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">{t('emptyTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
          </div>
          <Button asChild>
            <Link href="/dashboard/customer/book">{t('emptyCta')}</Link>
          </Button>
        </div>
      ) : (
        <section aria-label={t('all')} className="flex flex-col gap-2">
          {booking ? <h2 className="mt-2 text-lg font-medium">{t('all')}</h2> : null}
          {shipments.items.map((shipment) => (
            <ShipmentListItem
              key={shipment.id}
              shipment={shipment}
              showRecipientName={filters.scope === 'business' && business !== null}
            />
          ))}
        </section>
      )}

      <Pagination page={shipments.page} totalPages={shipments.totalPages} href={shipmentListHref(BASE_PATH, filters)} />
    </main>
  );
};

export default DeliveriesPage;
