import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import StatCard from '@/components/dashboard/stat-card';
import Pagination from '@/components/dashboard/pagination';
import CashFiltersForm from '@/components/operator/cash-filters-form';
import { getCurrentProfile } from '@/lib/auth/session';
import { cashHref } from '@/lib/cash/schemas';
import { countPendingRemittances, getDriverCashTotals, listDriverCash } from '@/services/cash/driver-cash';
import { getFormat } from '@/i18n/server';

import type { CashFilters } from '@/lib/cash/schemas';
import type { StaffListViewProps } from '@/components/staff-views/types';

// Driver Cash Reconciliation (migration 0042): what each driver collected,
// handed over and still owes. Every figure comes from the database's own
// totals, under the same filters for the cards and the table.
const CashView = async ({ basePath, page, filters }: StaffListViewProps & { filters: CashFilters }) => {
  const listPath = `${basePath}/cash`;
  const [profile, t, format, data] = await Promise.all([
    getCurrentProfile(),
    getTranslations('operator.cash'),
    getFormat(),
    Promise.all([listDriverCash(page, filters), getDriverCashTotals(filters), countPendingRemittances()]).catch(
      (error: unknown) => {
        console.error('Driver cash summary failed', error instanceof Error ? error.message : error);
        return null;
      },
    ),
  ]);
  const aed = (amount: number) => format.money(amount);
  const isManager = profile?.role === 'manager';
  const hasPeriod = Boolean(filters.from || filters.to);
  const period = hasPeriod
    ? t('period.range', {
        from: filters.from ? format.date(`${filters.from}T00:00:00+04:00`) : '…',
        to: filters.to ? format.date(`${filters.to}T00:00:00+04:00`) : '…',
      })
    : t('period.allTime');

  const header = (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('intro')}</p>
      </div>
      <CashFiltersForm path={listPath} filters={filters} />
    </>
  );

  if (!data) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        {header}
        <div className="rounded-md border border-destructive/40 p-6 text-center" role="alert">
          <p className="font-medium">{t('loadFailed')}</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={cashHref(listPath, filters)}>{t('retry')}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const [drivers, totals, pendingCount] = data;
  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      {header}
      {isManager && pendingCount > 0 ? (
        <p className="rounded-md border border-primary/30 bg-secondary/50 p-3 text-sm" role="status">
          {t('pendingQueue', { count: pendingCount })}
        </p>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="cash-now">
        <h2 id="cash-now" className="text-lg font-medium">
          {t('cards.nowHeading')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('cards.outstanding')} value={aed(totals.outstanding)} />
          <StatCard label={t('cards.expected')} value={aed(totals.expected)} />
          <StatCard label={t('cards.pending')} value={aed(totals.pending)} />
          <StatCard label={t('cards.unverified')} value={aed(totals.unverified)} />
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="cash-period">
        <h2 id="cash-period" className="text-lg font-medium">
          {t('cards.periodHeading', { period })}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label={t('cards.collected')} value={aed(hasPeriod ? totals.collectedInPeriod : totals.collected)} />
          <StatCard label={t('cards.remitted')} value={aed(hasPeriod ? totals.remittedInPeriod : totals.remitted)} />
        </div>
        <p className="text-xs text-muted-foreground">{t('cards.periodNote')}</p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="cash-drivers">
        <h2 id="cash-drivers" className="text-lg font-medium">
          {t('drivers')}
        </h2>
        {drivers.items.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="font-medium">{filters.q ? t('emptySearch') : t('empty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('drivers')}</caption>
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t('columns.driver')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">
                    {t('columns.shipments')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">
                    {t('columns.expected')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">
                    {t('columns.collected')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">
                    {t('columns.remitted')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">
                    {t('columns.outstanding')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">
                    {t('columns.pending')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t('columns.lastRemittance')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">
                    <span className="sr-only">{t('columns.action')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {drivers.items.map((row) => (
                  <tr key={row.driverId} className="border-t align-top">
                    <th scope="row" className="px-3 py-2 text-start font-normal">
                      <Link
                        href={cashHref(`${listPath}/${row.driverId}`, filters)}
                        className="font-medium hover:underline"
                      >
                        {row.driverName}
                      </Link>
                      <span dir="ltr" className="block font-brand-mono text-xs text-muted-foreground rtl:text-right">
                        {row.driverPhone}
                      </span>
                      {row.unverified > 0 ? (
                        <span className="block text-xs text-muted-foreground">
                          {t('unverifiedNote', { amount: aed(row.unverified) })}
                        </span>
                      ) : null}
                    </th>
                    <td className="px-3 py-2 text-end font-brand-mono">{format.number(row.shipments)}</td>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{aed(row.expected)}</td>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">
                      {aed(hasPeriod ? row.collectedInPeriod : row.collected)}
                    </td>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">
                      {aed(hasPeriod ? row.remittedInPeriod : row.remitted)}
                    </td>
                    <td className="px-3 py-2 text-end font-brand-mono font-semibold whitespace-nowrap">
                      {aed(row.outstanding)}
                    </td>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">
                      {row.pending > 0 ? aed(row.pending) : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.lastRemittanceOn ? format.date(`${row.lastRemittanceOn}T00:00:00+04:00`) : '—'}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <Button asChild size="sm" variant={row.outstanding > 0 ? 'default' : 'outline'}>
                        <Link href={cashHref(`${listPath}/${row.driverId}`, filters)}>
                          {row.outstanding > 0 ? t('recordAction') : t('view')}
                          <span className="sr-only"> — {row.driverName}</span>
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={drivers.page} totalPages={drivers.totalPages} href={cashHref(listPath, filters)} />
      </section>

      <details className="rounded-md border p-4 text-sm">
        <summary className="cursor-pointer font-medium">{t('definitions.title')}</summary>
        <dl className="mt-3 grid gap-2 sm:grid-cols-[max-content_1fr] sm:gap-x-4">
          {(['expected', 'collected', 'remitted', 'outstanding', 'pending', 'unverified'] as const).map((key) => (
            <div key={key} className="contents">
              <dt className="font-medium">{t(`definitions.${key}.term`)}</dt>
              <dd className="text-muted-foreground">{t(`definitions.${key}.meaning`)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </main>
  );
};

export default CashView;
