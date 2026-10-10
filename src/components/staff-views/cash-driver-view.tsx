import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/stat-card';
import Pagination from '@/components/dashboard/pagination';
import CashFiltersForm from '@/components/operator/cash-filters-form';
import RecordRemittanceForm from '@/components/operator/record-remittance-form';
import RemittanceDecision from '@/components/operator/remittance-decision';
import { getCurrentProfile } from '@/lib/auth/session';
import { todayInUae } from '@/lib/bulk/schemas';
import { cashHref } from '@/lib/cash/schemas';
import {
  getDriverCashPosition,
  getDriverIdentity,
  listDriverCollections,
  listDriverRemittances,
} from '@/services/cash/driver-cash';
import { getFormat } from '@/i18n/server';

import type { DriverLedgerFilters } from '@/lib/cash/schemas';
import type { StaffViewProps } from '@/components/staff-views/types';

type CashDriverViewProps = StaffViewProps & {
  driverId: string;
  filters: DriverLedgerFilters;
  collectionsPage: number;
  remittancesPage: number;
};

const COLLECTION_VARIANT: Record<string, 'default' | 'secondary' | 'success'> = {
  expected: 'secondary',
  collected: 'default',
  reconciled: 'success',
  remitted: 'success',
};

const REMITTANCE_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'destructive'> = {
  pending: 'secondary',
  confirmed: 'success',
  rejected: 'destructive',
};

// One driver's cash: their position, the collections and remittances behind
// it (filtered and paged in the database), and recording a remittance.
const CashDriverView = async ({ basePath, driverId, filters, collectionsPage, remittancesPage }: CashDriverViewProps) => {
  const driver = await getDriverIdentity(driverId);
  if (!driver) notFound();

  const listPath = `${basePath}/cash`;
  const path = `${listPath}/${driverId}`;
  const [profile, position, collections, remittances, t, tCod, tShipments, format] = await Promise.all([
    getCurrentProfile(),
    getDriverCashPosition(driverId, filters),
    listDriverCollections(driverId, filters, collectionsPage),
    listDriverRemittances(driverId, filters, remittancesPage),
    getTranslations('operator.cash'),
    getTranslations('shipments.codStatus'),
    getTranslations('shipments'),
    getFormat(),
  ]);
  const aed = (amount: number) => format.money(amount);
  const isManager = profile?.role === 'manager';
  const outstanding = position?.outstanding ?? 0;
  const pending = position?.pending ?? 0;
  const available = Math.max(0, Math.round((outstanding - pending) * 100) / 100);
  const day = (date: string) => format.date(`${date}T00:00:00+04:00`);
  // Each list pages on its own (?cp= / ?rp=), keeping the filters and the
  // other list's page.
  const pageHref = (list: 'cp' | 'rp') => {
    const href = cashHref(path, filters);
    const other = list === 'cp' ? `rp=${remittancesPage}` : `cp=${collectionsPage}`;
    return `${href}${href.includes('?') ? '&' : '?'}${other}`;
  };

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <Link href={cashHref(listPath, { q: '', from: filters.from, to: filters.to })} className="text-sm text-muted-foreground hover:underline">
          <span className="inline-block rtl:rotate-180" aria-hidden>
            ←
          </span>{' '}
          {t('back')}
        </Link>
        <h1 className="text-2xl font-semibold">{driver.fullName}</h1>
        <p dir="ltr" className="font-brand-mono text-sm text-muted-foreground rtl:text-right">
          {driver.phone}
        </p>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="driver-now">
        <h2 id="driver-now" className="text-lg font-medium">
          {t('cards.nowHeading')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('cards.outstanding')} value={aed(outstanding)} />
          <StatCard label={t('cards.collectedAllTime')} value={aed(position?.collected ?? 0)} />
          <StatCard label={t('cards.remittedAllTime')} value={aed(position?.remitted ?? 0)} />
          <StatCard label={t('cards.expected')} value={aed(position?.expected ?? 0)} />
        </div>
        {pending > 0 || (position?.unverified ?? 0) > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {pending > 0 ? <li>{t('pendingNote', { amount: aed(pending) })}</li> : null}
            {(position?.unverified ?? 0) > 0 ? (
              <li>{t('unverifiedNote', { amount: aed(position?.unverified ?? 0) })}</li>
            ) : null}
          </ul>
        ) : null}
      </section>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <h2 className="text-lg font-medium">{t('recordAction')}</h2>
          {available > 0 ? (
            <RecordRemittanceForm
              driverId={driverId}
              driverName={driver.fullName}
              available={available}
              confirmsImmediately={isManager}
              today={todayInUae()}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{pending > 0 ? t('nothingAvailable') : t('nothingOwed')}</p>
          )}
        </CardContent>
      </Card>

      <CashFiltersForm path={path} filters={filters} ledger />

      <section className="flex flex-col gap-3" aria-labelledby="driver-remittances">
        <h2 id="driver-remittances" className="text-lg font-medium">
          {t('remittances.title')}
        </h2>
        {remittances.items.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm">{t('remittances.empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('remittances.title')}</caption>
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('remittances.columns.received')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('remittances.columns.amount')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('remittances.columns.method')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('remittances.columns.status')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('remittances.columns.recorded')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">
                    <span className="sr-only">{t('columns.action')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {remittances.items.map((remittance) => (
                  <tr key={remittance.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{day(remittance.receivedOn)}</td>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">
                      {format.money(remittance.amount, remittance.currency)}
                    </td>
                    <td className="px-3 py-2">
                      {t(`methods.${remittance.method}`)}
                      {remittance.reference ? (
                        <span dir="ltr" className="block font-brand-mono text-xs text-muted-foreground rtl:text-right">
                          {remittance.reference}
                        </span>
                      ) : null}
                      {remittance.notes ? (
                        <span className="block text-xs text-muted-foreground wrap-break-word">{remittance.notes}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={REMITTANCE_VARIANT[remittance.status] ?? 'default'}>{t(`status.${remittance.status}`)}</Badge>
                      {remittance.decidedBy && remittance.decidedAt ? (
                        <span className="block text-xs text-muted-foreground">
                          {t('remittances.decidedBy', { name: remittance.decidedBy, date: format.dateTime(remittance.decidedAt) })}
                        </span>
                      ) : null}
                      {remittance.decisionNote ? (
                        <span className="block text-xs text-muted-foreground wrap-break-word">{remittance.decisionNote}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {t('remittances.recordedBy', { name: remittance.recordedBy, date: format.dateTime(remittance.createdAt) })}
                    </td>
                    <td className="px-3 py-2 text-end">
                      {isManager && remittance.status === 'pending' ? (
                        <RemittanceDecision remittanceId={remittance.id} amount={remittance.amount} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={remittances.page} totalPages={remittances.totalPages} href={pageHref('rp')} param="rp" />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="driver-collections">
        <h2 id="driver-collections" className="text-lg font-medium">
          {t('collections.title')}
        </h2>
        {collections.items.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm">{t('collections.empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('collections.title')}</caption>
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('collections.columns.shipment')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('collections.columns.expected')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('collections.columns.collected')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('collections.columns.status')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('collections.columns.collectedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {collections.items.map((record) => (
                  <tr key={record.id} className="border-t align-top">
                    <th scope="row" className="px-3 py-2 text-start font-normal">
                      <Link href={`${basePath}/shipments/${record.shipmentId}`} dir="ltr" className="font-brand-mono hover:underline">
                        {record.trackingNumber}
                      </Link>
                      {record.shipmentStatus ? (
                        <span className="block text-xs text-muted-foreground">{tShipments(`status.${record.shipmentStatus}`)}</span>
                      ) : null}
                    </th>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">
                      {format.money(record.expectedAmount, record.currency)}
                      {record.productAmount > 0 && record.deliveryFeeAmount > 0 ? (
                        <span className="block text-xs text-muted-foreground">
                          {t('collections.split', {
                            goods: format.money(record.productAmount, record.currency),
                            fee: format.money(record.deliveryFeeAmount, record.currency),
                          })}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">
                      {record.collectedAmount !== null
                        ? format.money(record.collectedAmount, record.currency)
                        : record.status === 'expected'
                          ? '—'
                          : t('collections.unverified')}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={COLLECTION_VARIANT[record.status] ?? 'default'}>{tCod(record.status)}</Badge>
                      {record.remittanceId ? (
                        <span className="block text-xs text-muted-foreground">{t('collections.settled')}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{record.collectedAt ? format.dateTime(record.collectedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={collections.page} totalPages={collections.totalPages} href={pageHref('cp')} param="cp" />
      </section>

    </main>
  );
};

export default CashDriverView;
