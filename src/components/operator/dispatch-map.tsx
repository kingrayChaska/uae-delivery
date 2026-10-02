'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

import { UAE_DEFAULT_CENTER, UAE_DEFAULT_ZOOM } from '@/lib/maps/config';
import { useGoogleMap } from '@/lib/maps/use-google-map';
import { useAppLocale } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import type { DriverLocationState } from '@/lib/dispatch/driver-location-reducer';

type DispatchMapProps = {
  driverLocations: Record<string, DriverLocationState>;
  driverLabels: Record<string, string>;
  className?: string;
};

const DispatchMapCanvas = ({ driverLocations, driverLabels, className }: DispatchMapProps) => {
  const t = useTranslations('operator.dispatch');
  const tMap = useTranslations('maps.map');
  const { containerRef, map, status } = useGoogleMap(() => ({
    center: { lat: UAE_DEFAULT_CENTER[1], lng: UAE_DEFAULT_CENTER[0] },
    zoom: UAE_DEFAULT_ZOOM,
    gestureHandling: 'cooperative',
  }));
  const markersRef = useRef<Record<string, google.maps.marker.AdvancedMarkerElement>>({});
  const infoRef = useRef<google.maps.InfoWindow | null>(null);

  useEffect(() => {
    if (!map) return;
    infoRef.current ??= new google.maps.InfoWindow();

    const currentIds = new Set(Object.keys(driverLocations));

    // Remove markers for drivers no longer in the map (e.g. filtered out).
    for (const [driverId, marker] of Object.entries(markersRef.current)) {
      if (!currentIds.has(driverId)) {
        marker.map = null;
        delete markersRef.current[driverId];
      }
    }

    for (const [driverId, location] of Object.entries(driverLocations)) {
      const position = location.coordinates;
      const existing = markersRef.current[driverId];
      if (existing) {
        existing.position = position;
        continue;
      }

      const label = driverLabels[driverId] ?? t('driver');
      const el = document.createElement('div');
      el.className =
        'flex items-center justify-center rounded-full bg-brand-route text-white text-xs font-medium size-7 border-2 border-white shadow';
      el.textContent = (driverLabels[driverId] ?? '?').slice(0, 2).toUpperCase();

      const marker = new google.maps.marker.AdvancedMarkerElement({ map, position, content: el, title: label, gmpClickable: true });
      marker.addEventListener('gmp-click', () => {
        infoRef.current?.setContent(label);
        infoRef.current?.open({ map, anchor: marker });
      });
      markersRef.current[driverId] = marker;
    }
  }, [map, driverLocations, driverLabels, t]);

  useEffect(
    () => () => {
      Object.values(markersRef.current).forEach((marker) => {
        marker.map = null;
      });
      infoRef.current?.close();
    },
    [],
  );

  return (
    <div className={cn('relative overflow-hidden', className ?? 'h-96 w-full rounded-md')}>
      <div ref={containerRef} className="size-full" />
      {status === 'loading' ? (
        <div role="status" className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground animate-pulse">
          {tMap('loading')}
        </div>
      ) : null}
      {status === 'unavailable' ? (
        <div role="alert" className="absolute inset-0 flex items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">
          {tMap('servicesUnavailable')}
        </div>
      ) : null}
    </div>
  );
};

// A new map for each language: labels and control text are fixed when a
// map is created.
const DispatchMap = (props: DispatchMapProps) => <DispatchMapCanvas key={useAppLocale()} {...props} />;

export default DispatchMap;
