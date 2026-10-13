import { Fragment } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CircleAlert, CircleCheck, Download } from 'lucide-react';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import StatCard from '@/components/dashboard/stat-card';
import PrintButton from '@/components/shipment/label/print-button';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { failedLoad } from '@/lib/finance/load-error';
import { parsePeriod } from '@/lib/finance/schemas';
import { getCategoryTotals, getPerformanceSummary, getRevenueLines } from '@/services/finance/performance';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('finance.performance'))('meta'),
});

type SearchParams = Promise<{ from?: string; to?: string }>;

// Shown on screen; the CSV export has every line.
const DETAIL_ROWS = 200;

// Business Performance: revenue, expenditure, the four stepwise profit
// figures, net operating profit and break-even for one period. Every figure
// is computed by business_performance_summary() (migration 0044) in
// numeric; this page only lays it out.
const PerformancePage = async ({ searchParams }: { searchParams: SearchParams }) => {
  await requireRoleOrRedirect('manager');
  const params = await searchParams;
  const period = parsePeriod(params.from, params.to);
  const [t, format, summary, categories, lines] = await Promise.all([
    getTranslations('finance'),
    getFormat(),
    getPerformanceSummary(period).catch((error: unknown) => {
      console.error('Performance summary failed', error instanceof Error ? error.message : error);
      return null;
    }),
    getCategoryTotals(period).catch(failedLoad('Expense totals')),
    getRevenueLines(period, DETAIL_ROWS + 1).catch(failedLoad('Revenue lines')),
  ]);
  const aed = (value: number) => format.money(value);
  const query = `from=${period.from}&to=${period.to}`;

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
      <div>
        <h1 className="text-2xl font-semibold">{t('performance.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {format.calendarDate(period.from)} – {format.calendarDate(period.to)}
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="flex flex-col gap-1">
          <Label htmlFor="from">{t('performance.from')}</Label>
          <Input id="from" name="from" type="date" defaultValue={period.from} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to">{t('performance.to')}</Label>
          <Input id="to" name="to" type="date" defaultValue={period.to} className="w-40" />
        </div>
        <Button type="submit">{t('performance.apply')}</Button>
      </form>
    </div>
  );

  if (!summary) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        {header}
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <CircleAlert className="size-4" aria-hidden />
          {t('performance.loadFailed')}
        </p>
      </main>
    );
  }

  const profitable = summary.netOperatingProfit >= 0;
  const row = (label: ReactNode, value: number, options: { strong?: boolean; sign?: '-' | ''; hint?: ReactNode } = {}) => (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${options.strong ? 'border-t-2 border-foreground font-semibold' : 'border-b'}`}>
      <dt>
        {label}
        {options.hint ? <span className="block text-xs font-normal text-muted-foreground">{options.hint}</span> : null}
      </dt>
      <dd dir="ltr" className={`font-brand-mono whitespace-nowrap ${value < 0 ? 'text-destructive' : ''}`}>
        {options.sign === '-' && value > 0 ? '− ' : ''}
        {aed(value)}
      </dd>
    </div>
  );

  return (
    <main className="flex flex-1 flex-col gap-8 p-4 sm:p-6 print:gap-4 print:p-0" data-print-document>
      {header}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">{t('performance.title')}</h1>
        <p>
          {format.calendarDate(period.from)} – {format.calendarDate(period.to)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button asChild variant="outline" size="sm">
          <a href={`/api/manager/performance/export?type=summary&${query}`} download>
            <Download aria-hidden />
            {t('performance.export')}
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/manager/performance/export?type=lines&${query}`} download>
            <Download aria-hidden />
            {t('performance.details.exportLines')}
          </a>
        </Button>
        <PrintButton label={t('performance.print')} />
      </div>

      <p className="rounded-xl border bg-secondary/30 p-3 text-sm text-muted-foreground">{t('performance.basis')}</p>

      {/* A. Summary */}
      <section aria-labelledby="perf-summary" className="flex flex-col gap-3" data-print-keep>
        <h2 id="perf-summary" className="text-lg font-medium">
          {t('performance.summary.heading')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label={t('performance.summary.revenue')} value={aed(summary.totalRevenue)} />
          <StatCard label={t('performance.summary.expenditure')} value={aed(summary.totalExpenditure)} />
          <StatCard label={profitable ? t('performance.summary.profit') : t('performance.summary.loss')} value={aed(summary.netOperatingProfit)} />
          <StatCard label={t('performance.summary.target')} value={aed(summary.breakEvenRevenue)} />
          <StatCard label={t('performance.summary.gap')} value={aed(summary.breakEvenGap)} />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
        {/* B. Revenue */}
        <section aria-labelledby="perf-revenue" className="flex flex-col gap-2" data-print-keep>
          <h2 id="perf-revenue" className="text-lg font-medium">
            {t('performance.revenue.heading')}
          </h2>
          <dl className="text-sm">
            {row(t('performance.revenue.merchantService'), summary.merchantServiceRevenue)}
            {row(t('performance.revenue.merchantReturns'), summary.merchantReturnRevenue)}
            {row(t('performance.revenue.merchantHandling'), summary.merchantCashHandlingRevenue)}
            {row(t('performance.revenue.individual'), summary.individualRevenue)}
            {row(t('performance.revenue.other'), summary.otherRevenue, { hint: t('performance.revenue.otherHint') })}
            {row(t('performance.revenue.total'), summary.totalRevenue, { strong: true })}
          </dl>
          <p className="text-xs text-muted-foreground">
            {t('performance.revenue.counts', {
              delivered: summary.deliveredCount,
              merchant: summary.merchantDeliveredCount,
              individual: summary.individualDeliveredCount,
              returned: summary.returnedCount,
            })}
          </p>
          <div className="mt-2 rounded-lg border border-dashed p-3 text-sm">
            <p className="flex justify-between gap-4">
              <span>{t('performance.revenue.codMemo')}</span>
              <span dir="ltr" className="font-brand-mono">
                {aed(summary.merchantCodCollected)}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{t('performance.revenue.codMemoHint')}</p>
          </div>
        </section>

        {/* C. Expenses */}
        <section aria-labelledby="perf-expenses" className="flex flex-col gap-2" data-print-keep>
          <div className="flex items-center justify-between gap-3">
            <h2 id="perf-expenses" className="text-lg font-medium">
              {t('performance.expenses.heading')}
            </h2>
            <Link href={`/dashboard/manager/expenses?${query}`} className="text-sm text-primary hover:underline print:hidden">
              {t('performance.expenses.manage')}
            </Link>
          </div>
          {categories ? (
            <dl className="text-sm">
              {categories.map((category) => (
                <Fragment key={category.categoryId}>
                  {row(
                    <Link href={`/dashboard/manager/expenses?${query}&category=${category.categoryId}`} className="hover:underline">
                      {category.name}
                    </Link>,
                    category.total,
                    { hint: t('performance.expenses.countsAs', { group: t(`profitGroups.${category.profitGroup}`), count: category.expenseCount }) },
                  )}
                </Fragment>
              ))}
              {row(t('performance.expenses.total'), summary.totalExpenditure, { strong: true })}
            </dl>
          ) : (
            <p role="alert" className="text-sm text-destructive">
              {t('performance.loadFailed')}
            </p>
          )}
        </section>
      </div>

      {/* D. Profitability */}
      <section aria-labelledby="perf-profit" className="flex flex-col gap-2" data-print-keep>
        <h2 id="perf-profit" className="text-lg font-medium">
          {t('performance.profit.heading')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('performance.profit.description')}</p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('performance.profit.col.measure')}</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('performance.profit.col.formula')}</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">{t('performance.profit.col.deducted')}</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">{t('performance.profit.col.result')}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['revenue', null, summary.totalRevenue],
                  ['afterFuel', summary.fuel, summary.profitAfterFuel],
                  ['afterSubscription', summary.subscription, summary.profitAfterSubscription],
                  ['afterSalary', summary.salary, summary.profitAfterSalary],
                  ['afterRent', summary.rent, summary.profitAfterRent],
                  ['net', summary.otherExpenses, summary.netOperatingProfit],
                ] as const
              ).map(([key, deducted, result]) => (
                <tr key={key} className={`border-t ${key === 'net' ? 'bg-secondary/30 font-semibold' : ''}`}>
                  <th scope="row" className="px-3 py-2 text-start font-medium">
                    {t(`performance.profit.${key}`)}
                  </th>
                  <td dir="ltr" className="px-3 py-2 font-brand-mono text-xs text-muted-foreground rtl:text-right">
                    {t(`performance.profit.formula.${key}`)}
                  </td>
                  <td dir="ltr" className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">
                    {deducted === null ? '' : `− ${aed(deducted)}`}
                  </td>
                  <td dir="ltr" className={`px-3 py-2 text-end font-brand-mono whitespace-nowrap ${result < 0 ? 'text-destructive' : ''}`}>
                    {aed(result)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* E. Break-even */}
      <section aria-labelledby="perf-breakeven" className="flex flex-col gap-2" data-print-keep>
        <h2 id="perf-breakeven" className="text-lg font-medium">
          {t('performance.breakEven.heading')}
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <dl className="text-sm">
            {row(t('performance.breakEven.revenue'), summary.totalRevenue)}
            {row(t('performance.breakEven.expenditure'), summary.totalExpenditure)}
            {row(t('performance.breakEven.result'), summary.netOperatingProfit)}
            {row(t('performance.breakEven.target'), summary.breakEvenRevenue)}
            {row(t('performance.breakEven.gap'), summary.breakEvenGap, { strong: true })}
          </dl>
          <div className="flex flex-col gap-3">
            {summary.breakEvenGap === 0 ? (
              <p role="status" className="flex items-center gap-2 rounded-xl border border-success/50 bg-success/10 p-4 text-sm font-medium">
                <CircleCheck className="size-5 text-success" aria-hidden />
                {t('performance.breakEven.achieved')}
              </p>
            ) : (
              <p role="status" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm font-medium">
                <CircleAlert className="size-5 text-destructive" aria-hidden />
                {t('performance.breakEven.notAchieved', { amount: aed(summary.breakEvenGap) })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t('performance.breakEven.assumption')}</p>
          </div>
        </div>
      </section>

      {/* F. Supporting details */}
      <section aria-labelledby="perf-details" className="flex flex-col gap-2 print:hidden">
        <h2 id="perf-details" className="text-lg font-medium">
          {t('performance.details.heading')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('performance.details.description')}</p>
        {!lines ? (
          <p role="alert" className="text-sm text-destructive">
            {t('performance.loadFailed')}
          </p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('performance.details.none')}</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-2xl text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('performance.details.col.date')}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('performance.details.col.tracking')}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('performance.details.col.customer')}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('performance.details.col.outcome')}</th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">{t('performance.details.col.service')}</th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">{t('performance.details.col.return')}</th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">{t('performance.details.col.handling')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.slice(0, DETAIL_ROWS).map((line) => (
                    <tr key={line.shipmentId} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{format.date(line.eventAt)}</td>
                      <td dir="ltr" className="px-3 py-2 font-brand-mono rtl:text-right">
                        <Link href={`/dashboard/manager/shipments/${line.shipmentId}`} className="text-primary hover:underline">
                          {line.trackingNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{line.isMerchant ? t('performance.details.merchant') : t('performance.details.individual')}</td>
                      <td className="px-3 py-2">{t(`document.lines.${line.event}`)}</td>
                      <td dir="ltr" className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{aed(line.serviceCharge)}</td>
                      <td dir="ltr" className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{aed(line.returnCharge)}</td>
                      <td dir="ltr" className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{aed(line.cashHandlingFee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lines.length > DETAIL_ROWS ? (
              <p className="text-xs text-muted-foreground">{t('performance.details.truncated', { shown: DETAIL_ROWS })}</p>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
};

export default PerformancePage;
