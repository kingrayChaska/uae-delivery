import Link from 'next/link';
import { CircleAlert, RotateCw } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
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
  const [unassignedResult, snapshot, t, tShipments] = await Promise.all([
    listUnassignedShipments()
      .then((data) => ({ data }))
      .catch((error: unknown) => {
        console.error('Dispatch shipment list failed', error instanceof Error ? error.message : error);
        return { data: null };
      }),
    getDriverLocationsSnapshot(),
    getTranslations('operator.dispatch'),
    getTranslations('operator.shipments'),
  ]);
  const { data: unassigned } = unassignedResult;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {unassigned === null ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 p-8 text-center">
          <CircleAlert className="size-8 text-destructive" aria-hidden />
          <p className="font-medium">{tShipments('loadError')}</p>
          <Button asChild variant="outline">
            <Link href="/dashboard/operator/dispatch">
              <RotateCw aria-hidden />
              {tShipments('retry')}
            </Link>
          </Button>
        </div>
      ) : (
        <DispatchBoard
          unassignedShipments={unassigned}
          initialDriverLocations={snapshot.locations}
          driverLabels={snapshot.labels}
        />
      )}
    </main>
  );
};

export default DispatchPage;
