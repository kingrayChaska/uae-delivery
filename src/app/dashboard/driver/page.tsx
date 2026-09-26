import Link from 'next/link';

import StatCard from '@/components/dashboard/stat-card';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { getCurrentProfile } from '@/lib/auth/session';
import { getDriverDashboardSummary } from '@/services/shipments/list-driver-shipments';

const DriverDashboardPage = async () => {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const summary = await getDriverDashboardSummary(profile.id);
  const { recent } = summary;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {profile.fullName}</h1>
        <p className="text-muted-foreground">Here&apos;s your delivery activity.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today's Deliveries" value={String(summary.todayCount)} />
        <StatCard label="Completed" value={String(summary.completedCount)} />
        <StatCard label="Pending" value={String(summary.pendingCount)} />
        <StatCard label="COD Collected" value={`${summary.currency} ${summary.codCollected.toFixed(2)}`} />
      </div>

      {summary.currentShipmentId ? (
        <Link
          href={`/dashboard/driver/deliveries/${summary.currentShipmentId}`}
          className="rounded-md border border-primary/40 bg-secondary/40 p-4 hover:bg-secondary/60"
        >
          <p className="text-sm text-muted-foreground">Current assignment</p>
          <p className="font-medium">Continue your active delivery →</p>
        </Link>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Recent deliveries</h2>
        {recent.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="font-medium">No deliveries yet</p>
            <p className="text-sm text-muted-foreground">Assignments from dispatch will appear here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((shipment) => (
              <ShipmentListItem key={shipment.id} shipment={shipment} basePath="/dashboard/driver/deliveries" />
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

export default DriverDashboardPage;
