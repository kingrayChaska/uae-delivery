'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Crosshair } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { BRAND } from '@/lib/brand';
import { useMapI18n } from '@/lib/maps/use-map-i18n';
import { useAppLocale } from '@/i18n/hooks';

import type { Coordinates } from '@/lib/types';

import 'mapbox-gl/dist/mapbox-gl.css';

type MapLocationSelectorProps = {
  initial: Coordinates;
  // Street level when we know roughly where the customer is; city level otherwise.
  initialZoom: number;
  onMove: (coordinates: Coordinates) => void;
  className?: string;
};

const round = (value: number) => Math.round(value * 1e6) / 1e6;

// A single map with one draggable pin. The customer can drag the pin, tap
// the map to move it there, pan and zoom; keyboard users can pan with the
// arrow keys and use "Put pin at map centre". Every move is reported once
// it settles, and the parent reverse-geocodes it.
const MapLocationSelectorCanvas = ({ initial, initialZoom, onMove, className = '' }: MapLocationSelectorProps) => {
  const t = useTranslations('maps.map');
  const mapI18n = useMapI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onMoveRef = useRef(onMove);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  // The initial point only seeds the map; later moves come from the map.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error('NEXT_PUBLIC_MAPBOX_TOKEN is not configured');
      // Deferred so it isn't a synchronous state update inside the effect.
      queueMicrotask(() => setUnavailable(true));
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [initial.lng, initial.lat],
      zoom: initialZoom,
      ...mapI18n.options(),
    });
    // Zoom buttons on the end side, away from "Put pin at map centre".
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), mapI18n.rtl ? 'top-left' : 'top-right');

    const marker = new mapboxgl.Marker({ color: BRAND.purple, draggable: true }).setLngLat([initial.lng, initial.lat]).addTo(map);
    const report = (lngLat: mapboxgl.LngLat) => onMoveRef.current({ lat: round(lngLat.lat), lng: round(lngLat.lng) });

    marker.on('dragend', () => report(marker.getLngLat()));
    map.on('click', (event) => {
      marker.setLngLat(event.lngLat);
      report(event.lngLat);
    });
    map.on('error', () => setUnavailable(true));

    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Seeded once; see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pinAtCentre = () => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const centre = map.getCenter();
    marker.setLngLat(centre);
    onMoveRef.current({ lat: round(centre.lat), lng: round(centre.lng) });
  };

  if (unavailable) {
    return (
      <div className={`flex items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground ${className}`}>
        {t('unavailable')}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="size-full"
        role="application"
        aria-label={t('label')}
      />
      <button
        type="button"
        onClick={pinAtCentre}
        className="absolute bottom-3 start-3 flex min-h-10 items-center gap-2 rounded-lg bg-background/95 px-3 text-sm font-medium shadow-md ring-1 ring-border transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Crosshair className="size-4 text-primary" aria-hidden />
        {t('pinAtCentre')}
      </button>
    </div>
  );
};

// A new map for each language: labels and control text are fixed when a
// map is created. The pin survives: the parent passes its current position.
const MapLocationSelector = (props: MapLocationSelectorProps) => (
  <MapLocationSelectorCanvas key={useAppLocale()} {...props} />
);

export default MapLocationSelector;
