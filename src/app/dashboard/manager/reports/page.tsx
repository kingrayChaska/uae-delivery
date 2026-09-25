import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import StatCard from '@/components/dashboard/stat-card';
import ReportCharts from '@/components/manager/lazy-report-charts';
import ExportLink from '@/components/manager/export-link';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parseReportRange } from '@/lib/reports/range';
import { getReportData } from '@/services/reports/get-report-data';

type ReportsPageProps = { searchParams: Promise<{ from?: string; to?: string }> };

const aed = (value: number) => `AED ${value.toFixed(2)}`;

const ReportsPage = async ({ searchParams }: ReportsPageProps) => {
  await requireRoleOrRedirect('manager');
  const params = await searchParams;
  const range = parseReportRange(params.from, params.to);
  const data = await getReportData(range);
  const { fromParam: from, toParam: to } = range;

  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {from} to {to} · by booking date
          </p>
        </div>
        {/* Plain GET form: filters live in the URL, so reports are bookmarkable and shareable. */}
        <form className="flex flex-wrap items-end gap-2" method="get">
          <div className="flex flex-col gap-1">
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
          </div>
          <Button type="submit">Apply</Button>
        </form>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Shipments</h2>
          <ExportLink type="shipments" from={from} to={to} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total" value={String(data.shipments.total)} />
          <StatCard label="Delivered" value={String(data.shipments.delivered)} />
          <StatCard label="Pending" value={String(data.shipments.pending)} />
          <StatCard label="Failed" value={String(data.shipments.failed)} />
          <StatCard label="Cancelled" value={String(data.shipments.cancelled)} />
          <StatCard label="Returned" value={String(data.shipments.returned)} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Trends</h2>
          <ExportLink type="daily" from={from} to={to} label="Export daily CSV" />
        </div>
        <ReportCharts trend={data.trend} drivers={data.drivers} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Revenue</h2>
          <ExportLink type="revenue" from={from} to={to} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Delivery revenue" value={aed(data.revenue.deliveryRevenue)} />
          <StatCard label="Card payments" value={aed(data.revenue.cardRevenue)} />
          <StatCard label="COD collected" value={aed(data.revenue.codRevenue)} />
          <StatCard label="Refunds" value={aed(data.revenue.refunds)} />
          <StatCard label="Outstanding" value={aed(data.revenue.outstanding)} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Drivers</h2>
          <ExportLink type="drivers" from={from} to={to} />
        </div>
        {data.drivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No driver activity in this range.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 font-medium">Deliveries</th>
                  <th className="px-3 py-2 font-medium">Delivered</th>
                  <th className="px-3 py-2 font-medium">Failed</th>
                  <th className="px-3 py-2 font-medium">Success rate</th>
                  <th className="px-3 py-2 font-medium">COD collected</th>
                </tr>
              </thead>
              <tbody>
                {data.drivers.map((driver) => (
                  <tr key={driver.driverId} className="border-t">
                    <td className="px-3 py-2">{driver.name}</td>
                    <td className="px-3 py-2 font-brand-mono">{driver.deliveries}</td>
                    <td className="px-3 py-2 font-brand-mono">{driver.delivered}</td>
                    <td className="px-3 py-2 font-brand-mono">{driver.failed}</td>
                    <td className="px-3 py-2 font-brand-mono">{driver.successRate}%</td>
                    <td className="px-3 py-2 font-brand-mono">{aed(driver.codCollected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Customers</h2>
          <ExportLink type="customers" from={from} to={to} />
        </div>
        {data.customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No customer activity in this range.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Shipments</th>
                  <th className="px-3 py-2 font-medium">Total spent</th>
                  <th className="px-3 py-2 font-medium">COD</th>
                  <th className="px-3 py-2 font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((customer) => (
                  <tr key={customer.customerId} className="border-t">
                    <td className="px-3 py-2">{customer.name}</td>
                    <td className="px-3 py-2 font-brand-mono">{customer.shipments}</td>
                    <td className="px-3 py-2 font-brand-mono">{aed(customer.totalSpent)}</td>
                    <td className="px-3 py-2 font-brand-mono">{aed(customer.codAmount)}</td>
                    <td className="px-3 py-2 font-brand-mono">{aed(customer.outstanding)}</td>
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
