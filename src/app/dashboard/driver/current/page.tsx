import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getDriverDashboardSummary } from '@/services/shipments/list-driver-shipments';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('driver.current'))('meta'),
});

const CurrentDeliveryPage = async () => {
  const profile = await requireRoleOrRedirect('driver');
  const summary = await getDriverDashboardSummary(profile.id);

  if (summary.currentShipmentId) {
    redirect(`/dashboard/driver/deliveries/${summary.currentShipmentId}`);
  }

  const t = await getTranslations('driver.current');
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="font-medium">{t('emptyTitle')}</p>
      <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
    </main>
  );
};

export default CurrentDeliveryPage;
