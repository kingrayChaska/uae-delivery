import Link from 'next/link';
import { CircleAlert, RotateCw } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
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
  const page = parsePage((await searchParams).page);
  const [historyResult, t] = await Promise.all([
    listDriverHistory(profile.id, page)
      .then((data) => ({ data }))
      .catch((error: unknown) => {
        console.error('Driver shipment history failed', error instanceof Error ? error.message : error);
        return { data: null };
      }),
    getTranslations('driver.history'),
  ]);
  const { data: history } = historyResult;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {history === null ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 p-8 text-center">
          <CircleAlert className="size-8 text-destructive" aria-hidden />
          <p className="font-medium">{t('loadError')}</p>
          <Button asChild variant="outline">
            <Link href={`/dashboard/driver/history${page > 1 ? `?page=${page}` : ''}`}>
              <RotateCw aria-hidden />
              {t('retry')}
            </Link>
          </Button>
        </div>
      ) : history.items.length === 0 ? (
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

      {history ? <Pagination page={history.page} totalPages={history.totalPages} href="/dashboard/driver/history" /> : null}
    </main>
  );
};

export default DriverHistoryPage;
