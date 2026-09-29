'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Badge from '@/components/ui/badge';
import FieldError from '@/components/ui/field-error';
import { useAssignDriver } from '@/lib/hooks/use-assign-driver';
import { useFormat } from '@/i18n/hooks';

import type { AvailableDriver } from '@/services/drivers/list-available-drivers';

type AssignDriverPanelProps = {
  shipmentId: string;
  drivers: AvailableDriver[];
  mode?: 'assign' | 'reassign';
};

const AVAILABILITY_VARIANT: Record<string, 'success' | 'secondary' | 'default'> = {
  available: 'success',
  busy: 'secondary',
  offline: 'default',
};

const AssignDriverPanel = ({ shipmentId, drivers, mode = 'assign' }: AssignDriverPanelProps) => {
  const t = useTranslations('operator.dispatch');
  const tAvailability = useTranslations('shipments.driverAvailability');
  const format = useFormat();
  const { assign, isAssigning, error } = useAssignDriver(shipmentId, mode);

  if (drivers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('noDrivers')}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <FieldError message={error} /> : null}
      {drivers.map((driver) => (
        <div key={driver.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <p className="font-medium">{driver.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {driver.distanceFromPickupKm !== null
                ? t('fromPickup', { distance: format.km(driver.distanceFromPickupKm) })
                : t('locationUnknown')}{' '}
              · {t('active', { count: driver.activeDeliveryCount })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={AVAILABILITY_VARIANT[driver.availability]}>{tAvailability(driver.availability)}</Badge>
            <Button type="button" size="sm" disabled={isAssigning} onClick={() => assign(driver.id)}>
              {mode === 'assign' ? t('assign') : t('reassign')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AssignDriverPanel;
