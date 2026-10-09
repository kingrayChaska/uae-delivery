import { getTranslations } from 'next-intl/server';

import ShipmentListItem from '@/components/shipment/shipment-list-item';
import Pagination from '@/components/dashboard/pagination';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { listDriverHistory } from '@/services/shipments/list-driver-shipments';

import type { Metadata } from 'next';
import type { PageSearchParams } from '@/lib/pagination';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('driver.history'))('meta'),
});

const DriverHistoryPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  const profile = await requireRoleOrRedirect('driver');
  const [history, t] = await Promise.all([
    listDriverHistory(profile.id, parsePage((await searchParams).page)),
    getTranslations('driver.history'),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {history.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {history.items.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath="/dashboard/driver/deliveries" showRecipientName />
          ))}
        </div>
      )}

      <Pagination page={history.page} totalPages={history.totalPages} href="/dashboard/driver/history" />
    </main>
  );
};

export default DriverHistoryPage;
