'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAvailabilityToggle } from '@/lib/hooks/use-availability-toggle';

import type { DriverProfileDetail } from '@/services/drivers/get-driver-profile';

const AVAILABILITY_OPTIONS: DriverProfileDetail['availability'][] = ['available', 'busy', 'offline'];

const DriverDetailsCard = ({ detail }: { detail: DriverProfileDetail }) => {
  const t = useTranslations('driver.profile');
  const tShipments = useTranslations('shipments.driverAvailability');
  const { availability, update, isUpdating } = useAvailabilityToggle(detail.availability);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{t('driverId')}</p>
            <p dir="ltr" className="font-brand-mono rtl:text-right">
              {detail.driverCode}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('license')}</p>
            <p dir="ltr" className="font-brand-mono rtl:text-right">
              {detail.licenseNumber}
            </p>
          </div>
          {detail.vehicle ? (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">{t('vehicle')}</p>
              <p>
                {detail.vehicle.make} {detail.vehicle.model} · <span dir="ltr">{detail.vehicle.plateNumber}</span>
              </p>
            </div>
          ) : null}
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground" id="availability-label">
            {t('availability')}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="availability-label">
            {AVAILABILITY_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={availability === option ? 'default' : 'outline'}
                disabled={isUpdating}
                onClick={() => update(option)}
                aria-pressed={availability === option}
              >
                {tShipments(option)}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DriverDetailsCard;
