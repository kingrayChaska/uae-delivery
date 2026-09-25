import Link from 'next/link';

import Button from '@/components/ui/button';
import StatCard from '@/components/dashboard/stat-card';
import DispatchBoard from '@/components/operator/dispatch-board';
import BatchList from '@/components/bulk/batch-list';
import { getCurrentProfile } from '@/lib/auth/session';
import { getOperationsSummary } from '@/services/shipments/get-operations-summary';
import { listUnassignedShipments } from '@/services/shipments/list-all-shipments';
import { getDriverLocationsSnapshot } from '@/services/drivers/get-driver-locations-snapshot';
import { listBatches } from '@/services/bulk/list-batches';

// Spec section 21: the main Operator screen combines the shipment queue,
// the live map, and the assignment panel — so the home page embeds the
// same DispatchBoard as /dispatch, topped with the operational counters.
const OperatorDashboardPage = async () => {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const [summary, unassigned, snapshot, recentBatches] = await Promise.all([
    getOperationsSummary(),
    listUnassignedShipments(),
    getDriverLocationsSnapshot(),
    listBatches({ limit: 5 }),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Operations</h1>
          <p className="text-muted-foreground">Signed in as {profile.fullName}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/operator/shipments/new">New Shipment</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting Dispatch" value={String(summary.awaitingDispatch)} />
        <StatCard label="In Progress" value={String(summary.inProgress)} />
        <StatCard label="Failed — Needs Action" value={String(summary.failedNeedingAction)} />
        <StatCard label="COD to Reconcile" value={String(summary.codAwaitingReconciliation)} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent bulk lists</h2>
          <Link href="/dashboard/operator/bulk" className="text-sm text-muted-foreground hover:underline">
            View all
          </Link>
        </div>
        <BatchList
          batches={recentBatches}
          hrefBase="/dashboard/operator/bulk"
          showSender
          emptyMessage="No bulk lists submitted yet"
        />
      </div>

      <DispatchBoard
        unassignedShipments={unassigned}
        initialDriverLocations={snapshot.locations}
        driverLabels={snapshot.labels}
      />
    </main>
  );
};

export default OperatorDashboardPage;
