'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import DispatchMap from '@/components/operator/lazy-dispatch-map';
import AssignDriverPanel from '@/components/operator/assign-driver-panel';
import { useAvailableDrivers } from '@/lib/hooks/use-available-drivers';
import { useRealtimeDriverLocations } from '@/lib/hooks/use-realtime-driver-locations';
import { useRealtimeRefresh } from '@/lib/hooks/use-realtime-refresh';

import type { DriverLocationState } from '@/lib/dispatch/driver-location-reducer';
import type { Shipment } from '@/lib/types';

type DispatchBoardProps = {
  unassignedShipments: Shipment[];
  initialDriverLocations: Record<string, DriverLocationState>;
  driverLabels: Record<string, string>;
};

const DispatchBoard = ({ unassignedShipments, initialDriverLocations, driverLabels }: DispatchBoardProps) => {
  const t = useTranslations('operator.dispatch');
  const tShipments = useTranslations('shipments');
  const [selectedId, setSelectedId] = useState<string | null>(unassignedShipments[0]?.id ?? null);
  const driverLocations = useRealtimeDriverLocations(initialDriverLocations);
  useRealtimeRefresh('shipments');

  const selected = unassignedShipments.find((s) => s.id === selectedId) ?? null;
  const { drivers, isLoading } = useAvailableDrivers(selected?.pickup.coordinates ?? null);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-2 lg:col-span-1">
        <p className="text-sm font-medium">{t('awaiting', { count: unassignedShipments.length })}</p>
        {unassignedShipments.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('nothingWaiting')}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {unassignedShipments.map((shipment) => (
              <button
                key={shipment.id}
                type="button"
                onClick={() => setSelectedId(shipment.id)}
                className={`w-full min-w-0 rounded-md border p-3 text-start text-sm transition-colors ${
                  selectedId === shipment.id ? 'border-primary bg-secondary/50' : 'hover:bg-secondary/30'
                }`}
              >
                <p dir="ltr" className="font-brand-mono text-xs text-muted-foreground rtl:text-right">
                  {shipment.trackingNumber}
                </p>
                {/* The recipient (drop-off contact), as on the shipment lists. */}
                <p className="truncate font-semibold">{shipment.dropoff.contactName.trim() || tShipments('list.recipientNotProvided')}</p>
                <p className="flex min-w-0 items-center gap-1.5">
                  <span dir="auto" className="truncate">{shipment.pickup.formattedAddress}</span>
                  <span className="inline-block shrink-0 rtl:rotate-180" aria-hidden>→</span>
                  <span dir="auto" className="truncate">{shipment.dropoff.formattedAddress}</span>
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
        <DispatchMap driverLocations={driverLocations} driverLabels={driverLabels} />

        {selected ? (
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm font-medium">{t('assignTo', { code: selected.trackingNumber })}</p>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">{t('finding')}</p>
              ) : (
                <AssignDriverPanel shipmentId={selected.id} drivers={drivers} mode="assign" />
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
};

export default DispatchBoard;
