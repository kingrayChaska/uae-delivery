import Link from 'next/link';

import Button from '@/components/ui/button';
import StatCard from '@/components/dashboard/stat-card';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { getCurrentProfile } from '@/lib/auth/session';
import { getCustomerDashboardSummary } from '@/services/shipments/list-shipments';

const CustomerDashboardPage = async () => {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const summary = await getCustomerDashboardSummary(profile.id);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Welcome, {profile.fullName}</h1>
          <p className="text-muted-foreground">Here&apos;s what&apos;s happening with your deliveries.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/customer/bulk/new">Bulk Shipment</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/customer/book">Book Delivery</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Deliveries" value={String(summary.active)} />
        <StatCard label="Pending Deliveries" value={String(summary.pending)} />
        <StatCard label="Completed Deliveries" value={String(summary.completed)} />
        <StatCard label="Total Spent" value={`${summary.currency} ${summary.totalSpent.toFixed(2)}`} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent deliveries</h2>
          <Link href="/dashboard/customer/deliveries" className="text-sm text-muted-foreground hover:underline">
            View all
          </Link>
        </div>

        {summary.recent.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="font-medium">No active deliveries</p>
            <p className="text-sm text-muted-foreground">Your active shipments will appear here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {summary.recent.map((shipment) => (
              <ShipmentListItem key={shipment.id} shipment={shipment} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

export default CustomerDashboardPage;
