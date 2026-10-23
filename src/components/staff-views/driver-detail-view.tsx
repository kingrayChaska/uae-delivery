import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ArrowRight, CircleAlert, PackageSearch, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import Pagination from '@/components/dashboard/pagination';
import StatCard from '@/components/dashboard/stat-card';
import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import DriverShipmentFilters from '@/components/staff-views/driver-shipment-filters';
import { todayInUae } from '@/lib/bulk/schemas';
import { addAed } from '@/lib/cash/remittances';
import {
  DRIVER_DETAIL_FILTERS,
  countForDriverFilter,
  driverDetailHref,
  hasDriverFilters,
  resolveDriverPeriod,
} from '@/lib/drivers/detail-filters';
import { getDriverDetailOverview, getDriverShipmentCounts, listDriverShipments } from '@/services/drivers/driver-detail';
import { getFormat } from '@/i18n/server';

import type { DriverDetailFilter, DriverDetailState } from '@/lib/drivers/detail-filters';
import type { DriverShipmentRow } from '@/services/drivers/driver-detail';

type DriverDetailViewProps = {
  // The role's dashboard root, e.g. /dashboard/operator.
  basePath: string;
  driverId: string;
  state: DriverDetailState;
  page: number;
};

const AVAILABILITY_VARIANT: Record<string, 'success' | 'secondary' | 'default'> = {
  available: 'success',
  busy: 'secondary',
  offline: 'default',
};

const cardKey = (filter: DriverDetailFilter) => (filter === 'all' ? 'total' : filter);

// One driver for staff: who they are, their assigned shipments by status,
// the cash they collected in the reporting period, and what they hold now —
// then their shipments, searchable and filtered by status. Every number is
// counted or summed by the database (migration 0049); the status cards and
// the filter chips count exactly the rows the list shows.
const DriverDetailView = async ({ basePath, driverId, state, page }: DriverDetailViewProps) => {
  const path = `${basePath}/drivers/${driverId}`;
  const range = resolveDriverPeriod(state, todayInUae());
  const [t, tShipments, format] = await Promise.all([
    getTranslations('operator.driverDetail'),
    getTranslations('shipments'),
    getFormat(),
  ]);

  const data = await Promise.all([
    getDriverDetailOverview(driverId, range),
    getDriverShipmentCounts(driverId, '', range),
    state.q ? getDriverShipmentCounts(driverId, state.q, range) : Promise.resolve(null),
    listDriverShipments(driverId, page, state, range),
  ]).catch((error: unknown) => {
    console.error('Driver details failed', error);
    return null;
  });

  if (!data) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <Link href={`${basePath}/drivers`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t('back')}
        </Link>
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {t('loadFailed')}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={driverDetailHref(path, state, page)}>{t('retry')}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const [overview, periodCounts, searchCounts, shipments] = data;
  // Not a driver, or not one the caller may see: the database said nothing.
  if (!overview) notFound();
  // Past the last page of matches: back to the first.
  if (shipments.items.length === 0 && page > 1) redirect(driverDetailHref(path, state));

  const chipCounts = searchCounts ?? periodCounts;
  const aed = (amount: number) => format.money(amount);
  const periodRange =
    range.from && range.to
      ? t('period.range', { from: format.calendarDate(range.from), to: format.calendarDate(range.to) })
      : range.from
        ? t('period.since', { from: format.calendarDate(range.from) })
        : range.to
          ? t('period.until', { to: format.calendarDate(range.to) })
          : t('period.everything');
  const { driver, period, now } = overview;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3">
        <Link href={`${basePath}/drivers`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t('back')}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold break-words">{driver.name}</h1>
            <p className="font-brand-mono text-sm text-muted-foreground">
              <span dir="ltr">{driver.code}</span> · <span dir="ltr">{driver.phone}</span>
              {driver.vehicle ? <span className="font-sans"> · {driver.vehicle}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!driver.active ? <Badge variant="destructive">{t('inactive')}</Badge> : null}
            <Badge variant={AVAILABILITY_VARIANT[driver.availability] ?? 'default'}>{tShipments(`driverAvailability.${driver.availability}`)}</Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={`${basePath}/cash/${driver.id}`}>
                {t('cashLink')}
                <ArrowRight className="rtl:rotate-180" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <DriverShipmentFilters basePath={path} state={state} />

      <p className="-mt-3 text-sm font-medium" role="status">
        {t('period.current', { label: t(`period.${state.period}`), range: periodRange })}
      </p>

      <section className="flex flex-col gap-3" aria-labelledby="driver-shipments-heading">
        <h2 id="driver-shipments-heading" className="text-lg font-medium">
          {t('shipmentsHeading')}
        </h2>
        <p className="-mt-2 max-w-3xl text-sm text-muted-foreground">{t('shipmentsScope')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {DRIVER_DETAIL_FILTERS.map((filter) => (
            <StatCard
              key={filter}
              label={t(`cards.${cardKey(filter)}`)}
              value={format.number(countForDriverFilter(periodCounts, filter))}
              href={driverDetailHref(path, { period: state.period, from: state.from, to: state.to, status: filter })}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('charges', { charges: aed(period.charges), cash: aed(period.cashCharges), cod: aed(period.codDue) })}
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="driver-cash-heading">
        <h2 id="driver-cash-heading" className="text-lg font-medium">
          {t('cashHeading')}
        </h2>
        <p className="-mt-2 max-w-3xl text-sm text-muted-foreground">{t('cashScope')}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label={t('cards.feeCollected')} value={aed(period.feeCollected)} />
          <StatCard label={t('cards.codCollected')} value={aed(period.codCollected)} />
          <StatCard label={t('cards.outstanding')} value={aed(now.outstanding)} href={`${basePath}/cash/${driver.id}`} />
        </div>
        <p className="text-sm text-muted-foreground">
          {t('collectedShipments', { count: period.collectedShipments })} ·{' '}
          {aed(addAed(period.feeCollected, period.codCollected))}
        </p>
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-medium">{t('nowHeading')}</h3>
          <p className="text-xs text-muted-foreground">{t('nowScope')}</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
            <li>{t('outstandingSplit', { cod: aed(now.outstandingCod), fee: aed(now.outstandingFee) })}</li>
            {now.pending > 0 ? <li>{t('pendingNote', { amount: aed(now.pending) })}</li> : null}
            {now.confirmed > 0 ? <li>{t('confirmedNote', { amount: aed(now.confirmed) })}</li> : null}
            {now.expectedCod > 0 || now.expectedFee > 0 ? (
              <li>{t('expectedNote', { cod: aed(now.expectedCod), fee: aed(now.expectedFee) })}</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="driver-list-heading">
        <h2 id="driver-list-heading" className="sr-only">
          {t('filters.label')}
        </h2>
        <nav aria-label={t('filters.statusLabel')} className="flex flex-wrap gap-2">
          {DRIVER_DETAIL_FILTERS.map((filter) => {
            const current = state.status === filter;
            return (
              <Link
                key={filter}
                href={driverDetailHref(path, { ...state, status: filter })}
                aria-current={current ? 'page' : undefined}
                className={
                  current
                    ? 'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary bg-primary px-3 text-sm text-primary-foreground'
                    : 'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm hover:bg-secondary/60'
                }
              >
                {filter === 'all' ? t('filters.all') : t(`cards.${filter}`)}
                <span className="font-brand-mono text-xs">{format.number(countForDriverFilter(chipCounts, filter))}</span>
              </Link>
            );
          })}
        </nav>

        <p role="status" className="text-sm text-muted-foreground">
          {t('list.results', { count: shipments.total })}
        </p>

        {shipments.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
            <PackageSearch className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">{hasDriverFilters(state) ? t('list.empty') : t('list.emptyPeriod')}</p>
            {hasDriverFilters(state) ? (
              <Button asChild variant="outline">
                <Link href={driverDetailHref(path, { period: state.period, from: state.from, to: state.to })}>
                  <X aria-hidden />
                  {t('list.clearFilters')}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {shipments.items.map((shipment) => (
              <DriverShipmentItem key={shipment.id} shipment={shipment} href={`${basePath}/shipments/${shipment.id}`} t={t} tShipments={tShipments} format={format} />
            ))}
          </ul>
        )}

        <Pagination page={shipments.page} totalPages={shipments.totalPages} href={driverDetailHref(path, state)} />
      </section>
    </main>
  );
};

type Translator = Awaited<ReturnType<typeof getTranslations<'operator.driverDetail'>>>;
type ShipmentsTranslator = Awaited<ReturnType<typeof getTranslations<'shipments'>>>;
type Format = Awaited<ReturnType<typeof getFormat>>;

// One shipment with its own figures: its price, its COD amount, and what
// this driver collected on it — never a total standing in for them.
const DriverShipmentItem = ({
  shipment,
  href,
  t,
  tShipments,
  format,
}: {
  shipment: DriverShipmentRow;
  href: string;
  t: Translator;
  tShipments: ShipmentsTranslator;
  format: Format;
}) => {
  const money = (amount: number) => format.money(amount, shipment.currency);
  const postpaid = shipment.recipientPaymentType === 'postpaid';
  const cashFee = shipment.paymentMethod === 'cod';
  const collectedLine = (amount: number | null) =>
    amount !== null ? money(amount) : shipment.unverified ? t('list.unverified') : t('list.notCollected');

  let cash: string;
  if (shipment.cashStatus === null) cash = t('list.noCash');
  else if (shipment.cashExpected !== null) cash = t('list.expected', { amount: money(shipment.cashExpected) });
  else if (shipment.unverified) cash = t('list.unverified');
  else cash = tShipments(`codStatus.${shipment.cashStatus as 'expected' | 'collected' | 'reconciled' | 'remitted'}`);

  const field = (label: string, value: React.ReactNode, mono = false) => (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-brand-mono break-words' : 'break-words'}>{value}</dd>
    </div>
  );

  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={href}
            dir="ltr"
            className="font-brand-mono text-sm font-semibold tracking-wider hover:underline"
            aria-label={t('list.open', { tracking: shipment.trackingNumber })}
          >
            {shipment.trackingNumber}
          </Link>
          <span className="text-xs text-muted-foreground">{tShipments(`deliveryType.${shipment.deliveryType}.short`)}</span>
          {shipment.deliveryDate ? (
            <span className="text-xs text-muted-foreground">{t('list.scheduled', { date: format.calendarDate(shipment.deliveryDate) })}</span>
          ) : null}
        </div>
        <ShipmentStatusBadge status={shipment.status} />
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {field(
          t('list.recipient'),
          <>
            {shipment.recipientName.trim() || t('list.noName')}
            {shipment.recipientPhone ? (
              <span dir="ltr" className="block font-brand-mono text-xs text-muted-foreground rtl:text-right">
                {shipment.recipientPhone}
              </span>
            ) : null}
          </>,
        )}
        {field(t('list.sender'), shipment.senderName.trim() || t('list.noName'))}
        {field(t('list.pickup'), <span dir="auto">{shipment.pickupAddress}</span>)}
        {field(t('list.dropoff'), <span dir="auto">{shipment.dropoffAddress}</span>)}
        {field(t('list.booked'), format.dateTime(shipment.createdAt))}
        {field(t('list.completed'), shipment.completedAt ? format.dateTime(shipment.completedAt) : t('list.notCompleted'))}
        {field(
          t('list.payment'),
          <>
            {t('list.paymentLine', {
              method: tShipments(`paymentMethod.${shipment.paymentMethod}`),
              status: tShipments(`paymentStatus.${shipment.paymentStatus}`),
            })}
            <span className="block text-xs text-muted-foreground">{tShipments(`recipientPaymentShort.${shipment.recipientPaymentType}`)}</span>
          </>,
        )}
        {field(t('list.cash'), cash)}
        {field(t('list.deliveryCharge'), money(shipment.price), true)}
        {field(t('list.feeCollected'), cashFee ? collectedLine(shipment.feeCollected) : '—', true)}
        {field(t('list.codAmount'), postpaid ? money(shipment.codAmount) : '—', true)}
        {field(t('list.codCollected'), postpaid ? collectedLine(shipment.codCollected) : '—', true)}
        {field(t('list.shipmentId'), <span dir="ltr" className="font-brand-mono text-xs">{shipment.id}</span>)}
      </dl>
    </li>
  );
};

export default DriverDetailView;
