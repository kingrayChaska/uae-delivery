import Link from 'next/link';

import Button from '@/components/ui/button';
import StatCard from '@/components/dashboard/stat-card';
import BatchList from '@/components/bulk/batch-list';
import { getCurrentProfile } from '@/lib/auth/session';
import { getManagerSummary } from '@/services/shipments/get-manager-summary';
import { listAuditLogs } from '@/services/audit/list-audit-logs';
import { listRecentBatches } from '@/services/bulk/list-batches';
import { countMerchantApplicationsByStatus } from '@/services/merchant/applications';

const ManagerDashboardPage = async () => {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const [summary, activity, recentBatches, merchantCounts] = await Promise.all([
    getManagerSummary(),
    listAuditLogs(8),
    listRecentBatches(5),
    countMerchantApplicationsByStatus(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-muted-foreground">Signed in as {profile.fullName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/manager/reports">Reports</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/manager/drivers/new">Add driver</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/manager/operators/new">Add operator</Link>
          </Button>
        </div>
      </div>

      {merchantCounts.pending > 0 ? (
        <Link
          href="/dashboard/manager/merchants?status=pending"
          className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-secondary/50 p-4 text-sm transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span>
            <span className="font-semibold">
              {merchantCounts.pending} merchant {merchantCounts.pending === 1 ? 'application' : 'applications'}
            </span>{' '}
            waiting for review
          </span>
          <span className="font-medium text-primary">Review →</span>
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Booked Today" value={String(summary.shipmentsToday)} />
        <StatCard label="In Progress" value={String(summary.inProgress)} />
        <StatCard label="Awaiting Dispatch" value={String(summary.awaitingDispatch)} />
        <StatCard label="Failed — Needs Action" value={String(summary.failedNeedingAction)} />
        <StatCard label="Delivered This Month" value={String(summary.deliveredThisMonth)} />
        <StatCard label="COD Outstanding" value={`AED ${summary.codOutstanding.toFixed(2)}`} />
        <StatCard label="Active Drivers" value={String(summary.activeDrivers)} />
        <StatCard label="Active Operators" value={String(summary.activeOperators)} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent bulk lists</h2>
          <Link href="/dashboard/manager/bulk" className="text-sm text-muted-foreground hover:underline">
            View all
          </Link>
        </div>
        <BatchList
          batches={recentBatches}
          hrefBase="/dashboard/manager/bulk"
          showSender
          emptyMessage="No bulk lists submitted yet"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent activity</h2>
          <Link href="/dashboard/manager/activity" className="text-sm text-muted-foreground hover:underline">
            View all
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border text-sm">
            {activity.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-4 px-3 py-2">
                <span>
                  <span className="font-medium">{log.actorName ?? 'System'}</span>{' '}
                  <span className="font-brand-mono text-xs text-muted-foreground">{log.action}</span>
                </span>
                <span className="font-brand-mono text-xs text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
};

export default ManagerDashboardPage;
