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

const DriversView = async () => {
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
            <Card key={driver.id}>
              <CardContent className="flex flex-col gap-3 pt-6 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{driver.fullName}</p>
                    <p className="font-brand-mono text-xs text-muted-foreground">
                      <span dir="ltr">{driver.driverCode}</span> · <span dir="ltr">{driver.phone}</span>
                    </p>
                    {driver.vehicle ? <p className="text-xs text-muted-foreground">{driver.vehicle}</p> : null}
                  </div>
                  <Badge variant={AVAILABILITY_VARIANT[driver.availability]}>{tAvailability(driver.availability)}</Badge>
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
};

export default DriversView;
