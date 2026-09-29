import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import StatCard from '@/components/dashboard/stat-card';
import ReportCharts from '@/components/manager/lazy-report-charts';
import ExportLink from '@/components/manager/export-link';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parseReportRange } from '@/lib/reports/range';
import { getReportData } from '@/services/reports/get-report-data';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('manager.reports'))('meta'),
});

type ReportsPageProps = { searchParams: Promise<{ from?: string; to?: string }> };

const ReportsPage = async ({ searchParams }: ReportsPageProps) => {
  await requireRoleOrRedirect('manager');
  const params = await searchParams;
  const range = parseReportRange(params.from, params.to);
  const [data, t, format] = await Promise.all([getReportData(range), getTranslations('manager.reports'), getFormat()]);
  const { fromParam: from, toParam: to } = range;
  const aed = (value: number) => format.money(value);
  const count = (value: number) => format.number(value);

  return (
    <main className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('range', { from: format.calendarDate(from), to: format.calendarDate(to) })}
          </p>
        </div>
        {/* Plain GET form: filters live in the URL, so reports are bookmarkable and shareable. */}
        <form className="flex flex-wrap items-end gap-2" method="get">
          <div className="flex flex-col gap-1">
            <Label htmlFor="from">{t('from')}</Label>
            <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="to">{t('to')}</Label>
            <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
          </div>
          <Button type="submit">{t('apply')}</Button>
        </form>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{t('shipments')}</h2>
          <ExportLink type="shipments" from={from} to={to} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label={t('shipmentStats.total')} value={count(data.shipments.total)} />
          <StatCard label={t('shipmentStats.delivered')} value={count(data.shipments.delivered)} />
          <StatCard label={t('shipmentStats.pending')} value={count(data.shipments.pending)} />
          <StatCard label={t('shipmentStats.failed')} value={count(data.shipments.failed)} />
          <StatCard label={t('shipmentStats.cancelled')} value={count(data.shipments.cancelled)} />
          <StatCard label={t('shipmentStats.returned')} value={count(data.shipments.returned)} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{t('trends')}</h2>
          <ExportLink type="daily" from={from} to={to} label={t('exportDaily')} />
        </div>
        <ReportCharts trend={data.trend} drivers={data.drivers} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{t('revenue')}</h2>
          <ExportLink type="revenue" from={from} to={to} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label={t('revenueStats.delivery')} value={aed(data.revenue.deliveryRevenue)} />
          <StatCard label={t('revenueStats.card')} value={aed(data.revenue.cardRevenue)} />
          <StatCard label={t('revenueStats.cod')} value={aed(data.revenue.codRevenue)} />
          <StatCard label={t('revenueStats.refunds')} value={aed(data.revenue.refunds)} />
          <StatCard label={t('revenueStats.outstanding')} value={aed(data.revenue.outstanding)} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{t('drivers')}</h2>
          <ExportLink type="drivers" from={from} to={to} />
        </div>
        {data.drivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noDrivers')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('driverColumns.driver')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('driverColumns.deliveries')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('driverColumns.delivered')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('driverColumns.failed')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('driverColumns.successRate')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('driverColumns.cod')}</th>
                </tr>
              </thead>
              <tbody>
                {data.drivers.map((driver) => (
                  <tr key={driver.driverId} className="border-t">
                    <td className="px-3 py-2">{driver.name}</td>
                    <td className="px-3 py-2 font-brand-mono">{count(driver.deliveries)}</td>
                    <td className="px-3 py-2 font-brand-mono">{count(driver.delivered)}</td>
                    <td className="px-3 py-2 font-brand-mono">{count(driver.failed)}</td>
                    <td className="px-3 py-2 font-brand-mono">{t('percent', { value: format.number(driver.successRate) })}</td>
                    <td className="px-3 py-2 font-brand-mono whitespace-nowrap">{aed(driver.codCollected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{t('customers')}</h2>
          <ExportLink type="customers" from={from} to={to} />
        </div>
        {data.customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noCustomers')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('customerColumns.customer')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('customerColumns.shipments')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('customerColumns.spent')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('customerColumns.cod')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('customerColumns.outstanding')}</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((customer) => (
                  <tr key={customer.customerId} className="border-t">
                    <td className="px-3 py-2">{customer.name}</td>
                    <td className="px-3 py-2 font-brand-mono">{count(customer.shipments)}</td>
                    <td className="px-3 py-2 font-brand-mono whitespace-nowrap">{aed(customer.totalSpent)}</td>
                    <td className="px-3 py-2 font-brand-mono whitespace-nowrap">{aed(customer.codAmount)}</td>
                    <td className="px-3 py-2 font-brand-mono whitespace-nowrap">{aed(customer.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
};

export default ReportsPage;
