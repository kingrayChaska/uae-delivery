import Link from 'next/link';
import { ArrowRight, PackageSearch } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import MyShipmentLookup from '@/components/shipment/my-shipment-lookup';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getTrackingMilestones } from '@/lib/shipment/tracking-milestones';
import { listCustomerActiveShipments } from '@/services/shipments/list-shipments';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('customer.track'))('meta'),
});

const TrackPage = async () => {
  const profile = await requireRoleOrRedirect('customer');
  const [active, t, tTracking, format] = await Promise.all([
    listCustomerActiveShipments(profile.id),
    getTranslations('customer.track'),
    getTranslations('tracking.milestones'),
    getFormat(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <MyShipmentLookup />
        </CardContent>
      </Card>

      <section aria-labelledby="active-heading" className="flex flex-col gap-3">
        <h2 id="active-heading" className="text-lg font-medium">
          {t('onTheWay')} <span className="text-muted-foreground">({format.number(active.length)})</span>
        </h2>

        {active.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
            <PackageSearch className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/customer/deliveries">{t('past')}</Link>
            </Button>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {active.map((shipment) => {
              const milestones = getTrackingMilestones(shipment.status);
              const doneCount = milestones.filter((m) => m.done).length;
              const current = milestones.find((m) => m.current);
              const currentLabel = current ? tTracking(`${current.key}.label`) : t('awaitingPayment');
              return (
                <li key={shipment.id}>
                  <Link
                    href={`/dashboard/customer/deliveries/${shipment.id}`}
                    className="group flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span dir="ltr" className="font-brand-mono font-semibold tracking-wider">
                        {shipment.trackingNumber}
                      </span>
                      <ShipmentStatusBadge status={shipment.status} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{t('to', { address: shipment.dropoff.formattedAddress })}</p>
                    {/* The bar fills from the start side (right in Arabic). */}
                    <div
                      role="progressbar"
                      aria-label={t('progress', { code: shipment.trackingNumber })}
                      aria-valuemin={0}
                      aria-valuemax={milestones.length}
                      aria-valuenow={doneCount}
                      aria-valuetext={currentLabel}
                      className="h-2 overflow-hidden rounded-full bg-secondary"
                    >
                      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(doneCount / milestones.length) * 100}%` }} />
                    </div>
                    <p className="flex items-center justify-between text-sm font-medium">
                      {currentLabel}
                      <ArrowRight
                        className="size-4 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                        aria-hidden
                      />
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
};

export default TrackPage;
