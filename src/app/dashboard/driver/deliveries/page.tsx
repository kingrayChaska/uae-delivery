import { getTranslations } from 'next-intl/server';

import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listDriverActiveShipments } from '@/services/shipments/list-driver-shipments';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('driver.deliveries'))('meta'),
});

const DriverDeliveriesPage = async () => {
  const profile = await requireRoleOrRedirect('driver');
  const [active, t] = await Promise.all([listDriverActiveShipments(profile.id), getTranslations('driver.deliveries')]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {active.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('emptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath="/dashboard/driver/deliveries" />
          ))}
        </div>
      )}
    </main>
  );
};

export default DriverDeliveriesPage;
