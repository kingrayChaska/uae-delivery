'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { useTranslations } from 'next-intl';

import { UAE_DEFAULT_CENTER, UAE_DEFAULT_ZOOM } from '@/lib/maps/config';
import { useMapI18n } from '@/lib/maps/use-map-i18n';
import { useAppLocale } from '@/i18n/hooks';

import type { DriverLocationState } from '@/lib/dispatch/driver-location-reducer';

import 'mapbox-gl/dist/mapbox-gl.css';

type DispatchMapProps = {
  driverLocations: Record<string, DriverLocationState>;
  driverLabels: Record<string, string>;
  className?: string;
};

const DispatchMapCanvas = ({ driverLocations, driverLabels, className }: DispatchMapProps) => {
  const t = useTranslations('operator.dispatch');
  const mapI18n = useMapI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error('NEXT_PUBLIC_MAPBOX_TOKEN is not configured');
      return;
    }

    mapboxgl.accessToken = token;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: UAE_DEFAULT_CENTER,
      zoom: UAE_DEFAULT_ZOOM,
      ...mapI18n.options(),
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Created once per language (DispatchMap below remounts it on a switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(Object.keys(driverLocations));

    // Remove markers for drivers no longer in the map (e.g. filtered out).
    for (const [driverId, marker] of Object.entries(markersRef.current)) {
      if (!currentIds.has(driverId)) {
        marker.remove();
        delete markersRef.current[driverId];
      }
    }

    for (const [driverId, location] of Object.entries(driverLocations)) {
      const existing = markersRef.current[driverId];
      if (existing) {
        existing.setLngLat([location.coordinates.lng, location.coordinates.lat]);
        continue;
      }

      const el = document.createElement('div');
      el.className =
        'flex items-center justify-center rounded-full bg-brand-route text-white text-xs font-medium size-7 border-2 border-white shadow';
      el.textContent = (driverLabels[driverId] ?? '?').slice(0, 2).toUpperCase();

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([location.coordinates.lng, location.coordinates.lat])
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setText(driverLabels[driverId] ?? t('driver')))
        .addTo(map);

      markersRef.current[driverId] = marker;
    }
  }, [driverLocations, driverLabels, t]);

  return <div ref={containerRef} className={className ?? 'h-96 w-full rounded-md'} />;
};

// A new map for each language: labels and control text are fixed when a
// map is created.
const DispatchMap = (props: DispatchMapProps) => <DispatchMapCanvas key={useAppLocale()} {...props} />;

export default DispatchMap;
