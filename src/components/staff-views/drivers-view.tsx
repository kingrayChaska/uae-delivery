import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { listAllDrivers } from '@/services/drivers/list-all-drivers';
import { getFormat } from '@/i18n/server';


const AVAILABILITY_VARIANT: Record<string, 'success' | 'secondary' | 'default'> = {
  available: 'success',
  busy: 'secondary',
  offline: 'default',
};

// Each card opens that driver's shipments and cash (drivers/[id]).
const DriversView = async ({ basePath = '/dashboard/operator' }: { basePath?: string }) => {
  const [drivers, t, tAvailability, format] = await Promise.all([
    listAllDrivers(),
    getTranslations('operator.drivers'),
    getTranslations('shipments.driverAvailability'),
    getFormat(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {drivers.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('emptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {drivers.map((driver) => (
            <Link
              key={driver.id}
              href={`${basePath}/drivers/${driver.id}`}
              aria-label={t('open', { name: driver.fullName })}
              className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
            <Card className="h-full transition-shadow group-hover:border-primary/40 group-hover:shadow-md">
              <CardContent className="flex flex-col gap-3 pt-6 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{driver.fullName}</p>
                    <p className="font-brand-mono text-xs text-muted-foreground">
                      <span dir="ltr">{driver.driverCode}</span> · <span dir="ltr">{driver.phone}</span>
                    </p>
                    {driver.vehicle ? <p className="text-xs text-muted-foreground">{driver.vehicle}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={AVAILABILITY_VARIANT[driver.availability]}>{tAvailability(driver.availability)}</Badge>
                    <ChevronRight
                      className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                      aria-hidden
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t pt-3 font-brand-mono text-xs">
                  <div>
                    <p className="font-sans text-muted-foreground">{t('stats.today')}</p>
                    <p className="text-base">{format.number(driver.todayDeliveries)}</p>
                  </div>
                  <div>
                    <p className="font-sans text-muted-foreground">{t('stats.week')}</p>
                    <p className="text-base">{format.number(driver.weekDeliveries)}</p>
                  </div>
                  <div>
                    <p className="font-sans text-muted-foreground">{t('stats.month')}</p>
                    <p className="text-base">{format.number(driver.monthDeliveries)}</p>
                  </div>
                  <div>
                    <p className="font-sans text-muted-foreground">{t('stats.delivered')}</p>
                    <p className="text-base">{format.number(driver.successfulDeliveries)}</p>
                  </div>
                  <div>
                    <p className="font-sans text-muted-foreground">{t('stats.failed')}</p>
                    <p className="text-base">{format.number(driver.failedDeliveries)}</p>
                  </div>
                  <div>
                    <p className="font-sans text-muted-foreground">{t('stats.cod')}</p>
                    <p className="text-base">{format.money(driver.codCollected)}</p>
                  </div>
                  <div>
                    <p className="font-sans text-muted-foreground">{t('stats.cashHeld')}</p>
                    <p className="text-base">{format.money(driver.cashOutstanding)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
};

export default DriversView;
