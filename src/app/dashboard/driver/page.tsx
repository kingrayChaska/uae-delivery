import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import StatCard from '@/components/dashboard/stat-card';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { getCurrentProfile } from '@/lib/auth/session';
import { getDriverDashboardSummary } from '@/services/shipments/list-driver-shipments';
import { getFormat } from '@/i18n/server';

const DriverDashboardPage = async () => {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const [summary, t, format] = await Promise.all([
    getDriverDashboardSummary(profile.id),
    getTranslations('driver.home'),
    getFormat(),
  ]);
  const { recent } = summary;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('welcome', { name: profile.fullName })}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('stats.today')} value={format.number(summary.todayCount)} />
        <StatCard label={t('stats.completed')} value={format.number(summary.completedCount)} />
        <StatCard label={t('stats.pending')} value={format.number(summary.pendingCount)} />
        <StatCard label={t('stats.cod')} value={format.money(summary.codCollected, summary.currency)} />
      </div>

      {summary.currentShipmentId ? (
        <Link
          href={`/dashboard/driver/deliveries/${summary.currentShipmentId}`}
          className="flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-secondary/40 p-4 hover:bg-secondary/60"
        >
          <span>
            <span className="block text-sm text-muted-foreground">{t('current')}</span>
            <span className="block font-medium">{t('continue')}</span>
          </span>
          <ArrowRight className="size-5 shrink-0 text-primary rtl:rotate-180" aria-hidden />
        </Link>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t('recent')}</h2>
        {recent.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="font-medium">{t('emptyTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((shipment) => (
              <ShipmentListItem key={shipment.id} shipment={shipment} basePath="/dashboard/driver/deliveries" showRecipientName />
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

export default DriverDashboardPage;
