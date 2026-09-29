import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import StatCard from '@/components/dashboard/stat-card';
import DispatchBoard from '@/components/operator/dispatch-board';
import BatchList from '@/components/bulk/batch-list';
import { getCurrentProfile } from '@/lib/auth/session';
import { getOperationsSummary } from '@/services/shipments/get-operations-summary';
import { listUnassignedShipments } from '@/services/shipments/list-all-shipments';
import { getDriverLocationsSnapshot } from '@/services/drivers/get-driver-locations-snapshot';
import { listRecentBatches } from '@/services/bulk/list-batches';
import { getFormat } from '@/i18n/server';

// Spec section 21: the main Operator screen combines the shipment queue,
// the live map, and the assignment panel — so the home page embeds the
// same DispatchBoard as /dispatch, topped with the operational counters.
const OperatorDashboardPage = async () => {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const [summary, unassigned, snapshot, recentBatches, t, format] = await Promise.all([
    getOperationsSummary(),
    listUnassignedShipments(),
    getDriverLocationsSnapshot(),
    listRecentBatches(5),
    getTranslations('operator.home'),
    getFormat(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('signedInAs', { name: profile.fullName })}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/operator/shipments/new">{t('newShipment')}</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('stats.awaitingDispatch')} value={format.number(summary.awaitingDispatch)} />
        <StatCard label={t('stats.inProgress')} value={format.number(summary.inProgress)} />
        <StatCard label={t('stats.failed')} value={format.number(summary.failedNeedingAction)} />
        <StatCard label={t('stats.cod')} value={format.number(summary.codAwaitingReconciliation)} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{t('recentLists')}</h2>
          <Link href="/dashboard/operator/bulk" className="text-sm text-muted-foreground hover:underline">
            {t('viewAll')}
          </Link>
        </div>
        <BatchList batches={recentBatches} hrefBase="/dashboard/operator/bulk" showSender emptyMessage={t('noLists')} />
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
