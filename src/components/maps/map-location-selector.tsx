'use client';

import { useEffect, useRef } from 'react';
import { Crosshair } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { BRAND } from '@/lib/brand';
import { brandPin, useGoogleMap } from '@/lib/maps/use-google-map';
import { useAppLocale } from '@/i18n/hooks';

import type { Coordinates } from '@/lib/types';

type MapLocationSelectorProps = {
  initial: Coordinates;
  // Street level when we know roughly where the customer is; city level otherwise.
  initialZoom: number;
  onMove: (coordinates: Coordinates) => void;
  className?: string;
};

const round = (value: number) => Math.round(value * 1e6) / 1e6;

// A single map with one draggable pin. The customer can drag the pin, tap
// the map (or a place Google labels on it) to move it there, pan and zoom;
// keyboard users can pan with the arrow keys and use "Put pin at map
// centre". Every move is reported once it settles, and the parent
// reverse-geocodes it — so any spot Google's search doesn't know can still
// be chosen exactly.
const MapLocationSelectorCanvas = ({ initial, initialZoom, onMove, className = '' }: MapLocationSelectorProps) => {
  const t = useTranslations('maps.map');
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const onMoveRef = useRef(onMove);
  const { containerRef, map, status } = useGoogleMap(() => ({
    center: initial,
    zoom: initialZoom,
    // One finger pans on phones: this map is for placing a pin precisely.
    gestureHandling: 'greedy',
  }));

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  // The initial point only seeds the map; later moves come from the map.
  useEffect(() => {
    if (!map) return;
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: initial,
      gmpDraggable: true,
      content: brandPin(BRAND.purple),
      title: t('pin'),
    });
    const report = (latLng: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined) => {
      if (!latLng) return;
      const point = latLng instanceof google.maps.LatLng ? latLng.toJSON() : latLng;
      onMoveRef.current({ lat: round(point.lat), lng: round(point.lng) });
    };

    const dragListener = marker.addListener('dragend', () => report(marker.position));
    const clickListener = map.addListener('click', (event: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
      // A tap on a business/landmark icon would open Google's info bubble;
      // here it drops the pin on that place instead.
      if ('placeId' in event && event.placeId) event.stop();
      if (!event.latLng) return;
      marker.position = event.latLng;
      report(event.latLng);
    });

    markerRef.current = marker;
    return () => {
      dragListener.remove();
      clickListener.remove();
      marker.map = null;
      markerRef.current = null;
    };
    // Seeded once per map; see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  const pinAtCentre = () => {
    const marker = markerRef.current;
    const centre = map?.getCenter();
    if (!marker || !centre) return;
    marker.position = centre;
    onMoveRef.current({ lat: round(centre.lat()), lng: round(centre.lng()) });
  };

  if (status === 'unavailable') {
    return (
      <div role="alert" className={`flex items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground ${className}`}>
        {t('unavailable')}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="size-full" role="application" aria-label={t('label')} />
      {status === 'loading' ? (
        <div role="status" className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">
          {t('loading')}
        </div>
      ) : (
        <button
          type="button"
          onClick={pinAtCentre}
          className="absolute bottom-3 start-3 flex min-h-10 items-center gap-2 rounded-lg bg-background/95 px-3 text-sm font-medium shadow-md ring-1 ring-border transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Crosshair className="size-4 text-primary" aria-hidden />
          {t('pinAtCentre')}
        </button>
      )}
    </div>
  );
};

// A new map for each language: labels and control text are fixed when a
// map is created. The pin survives: the parent passes its current position.
const MapLocationSelector = (props: MapLocationSelectorProps) => (
  <MapLocationSelectorCanvas key={useAppLocale()} {...props} />
);

export default MapLocationSelector;
