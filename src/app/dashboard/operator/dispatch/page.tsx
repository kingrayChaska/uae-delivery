import { getTranslations } from 'next-intl/server';

import DispatchBoard from '@/components/operator/dispatch-board';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listUnassignedShipments } from '@/services/shipments/list-all-shipments';
import { getDriverLocationsSnapshot } from '@/services/drivers/get-driver-locations-snapshot';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('operator.dispatch'))('meta'),
});

const DispatchPage = async () => {
  await requireRoleOrRedirect('operator');
  const [unassigned, snapshot, t] = await Promise.all([
    listUnassignedShipments(),
    getDriverLocationsSnapshot(),
    getTranslations('operator.dispatch'),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <DispatchBoard
        unassignedShipments={unassigned}
        initialDriverLocations={snapshot.locations}
        driverLabels={snapshot.labels}
      />
    </main>
  );
};

export default DispatchPage;
