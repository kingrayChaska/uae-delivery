'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import DispatchMap from '@/components/operator/lazy-dispatch-map';
import Button from '@/components/ui/button';
import { useRealtimeDriverLocations } from '@/lib/hooks/use-realtime-driver-locations';

import type { DriverLocationState } from '@/lib/dispatch/driver-location-reducer';

type DriverInfo = {
  id: string;
  fullName: string;
  availability: 'available' | 'busy' | 'offline';
  hasActiveShipment: boolean;
};

type LiveMapViewProps = {
  drivers: DriverInfo[];
  initialLocations: Record<string, DriverLocationState>;
};

const FILTERS = ['all', 'available', 'in_transit', 'offline'] as const;
type Filter = (typeof FILTERS)[number];

const LiveMapView = ({ drivers, initialLocations }: LiveMapViewProps) => {
  const t = useTranslations('operator.liveMap');
  const tAvailability = useTranslations('shipments.driverAvailability');
  const [filter, setFilter] = useState<Filter>('all');
  const locations = useRealtimeDriverLocations(initialLocations);

  const filteredDriverIds = new Set(
    drivers
      .filter((driver) => {
        if (filter === 'all') return true;
        if (filter === 'available') return driver.availability === 'available';
        if (filter === 'in_transit') return driver.hasActiveShipment;
        if (filter === 'offline') return driver.availability === 'offline';
        return true;
      })
      .map((driver) => driver.id),
  );

  const filteredLocations = Object.fromEntries(
    Object.entries(locations).filter(([driverId]) => filteredDriverIds.has(driverId)),
  );

  const labels = Object.fromEntries(drivers.map((driver) => [driver.id, driver.fullName]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('filterLabel')}>
        {FILTERS.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={filter === option ? 'default' : 'outline'}
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
          >
            {t(`filters.${option}`)}
          </Button>
        ))}
      </div>

      <DispatchMap driverLocations={filteredLocations} driverLabels={labels} className="h-[32rem] w-full rounded-md" />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {drivers
          .filter((driver) => filteredDriverIds.has(driver.id))
          .map((driver) => (
            <div key={driver.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{driver.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {driver.hasActiveShipment ? t('onDelivery') : tAvailability(driver.availability)}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
};

export default LiveMapView;
