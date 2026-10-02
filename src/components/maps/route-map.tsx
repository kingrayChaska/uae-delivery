'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

import { UAE_DEFAULT_CENTER, UAE_DEFAULT_ZOOM } from '@/lib/maps/config';
import { BRAND } from '@/lib/brand';
import { brandPin, useGoogleMap } from '@/lib/maps/use-google-map';
import { useAppLocale } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import type { Coordinates } from '@/lib/types';
import type { RouteResult } from '@/lib/maps/types';

export type RouteEnd = 'pickup' | 'dropoff';

type RouteMapProps = {
  pickup?: Coordinates;
  dropoff?: Coordinates;
  route?: RouteResult;
  // When given, both pins can be dragged; called with the new point.
  onMove?: (end: RouteEnd, coordinates: Coordinates) => void;
  className?: string;
};

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const samePoint = (a?: Coordinates, b?: Coordinates) => a?.lat === b?.lat && a?.lng === b?.lng;

// Pickup (A, purple) and delivery (B, teal), the driving route between them
// once it's known, framed so both ends are always in view.
const RouteMapCanvas = ({ pickup, dropoff, route, onMove, className }: RouteMapProps) => {
  const t = useTranslations('maps.map');
  const { containerRef, map, status } = useGoogleMap(() => ({
    center: { lat: UAE_DEFAULT_CENTER[1], lng: UAE_DEFAULT_CENTER[0] },
    zoom: UAE_DEFAULT_ZOOM,
    // A preview inside a scrolling page: one finger scrolls the page, two
    // move the map.
    gestureHandling: 'cooperative',
  }));
  const markersRef = useRef<Partial<Record<RouteEnd, google.maps.marker.AdvancedMarkerElement>>>({});
  const linesRef = useRef<google.maps.Polyline[]>([]);
  const onMoveRef = useRef(onMove);
  const draggable = Boolean(onMove);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  // Markers: created once per end, then moved — never recreated on every render.
  useEffect(() => {
    if (!map) return;
    const ends: [RouteEnd, Coordinates | undefined, string, string][] = [
      ['pickup', pickup, BRAND.purple, 'A'],
      ['dropoff', dropoff, BRAND.teal, 'B'],
    ];
    for (const [end, point, colour, glyph] of ends) {
      const existing = markersRef.current[end];
      if (!point) {
        if (existing) existing.map = null;
        delete markersRef.current[end];
        continue;
      }
      if (existing) {
        existing.position = point;
        existing.gmpDraggable = draggable;
        continue;
      }
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: point,
        gmpDraggable: draggable,
        content: brandPin(colour, glyph),
        title: end === 'pickup' ? t('pickup') : t('dropoff'),
      });
      marker.addListener('dragend', () => {
        const position = marker.position;
        if (!position) return;
        const { lat, lng } = position instanceof google.maps.LatLng ? position.toJSON() : position;
        onMoveRef.current?.(end, { lat: round(lat), lng: round(lng) });
      });
      markersRef.current[end] = marker;
    }
    // t is stable per locale, and the map remounts on a locale change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, draggable]);

  // The route line: a white casing under the brand colour, for contrast on
  // any background.
  useEffect(() => {
    if (!map) return;
    linesRef.current.forEach((line) => line.setMap(null));
    linesRef.current = [];
    const path = route?.path ?? [];
    if (path.length > 1) {
      linesRef.current = [
        new google.maps.Polyline({ map, path, strokeColor: '#ffffff', strokeOpacity: 0.9, strokeWeight: 8, zIndex: 1, clickable: false }),
        new google.maps.Polyline({ map, path, strokeColor: BRAND.purple, strokeOpacity: 0.95, strokeWeight: 5, zIndex: 2, clickable: false }),
      ];
    }
  }, [map, route]);

  // Frame both ends (and the route) — only when what's shown changes, not
  // on unrelated re-renders, so a customer's own panning isn't undone.
  const framedRef = useRef<{ pickup?: Coordinates; dropoff?: Coordinates; route?: RouteResult }>({});
  useEffect(() => {
    if (!map) return;
    const framed = framedRef.current;
    if (samePoint(framed.pickup, pickup) && samePoint(framed.dropoff, dropoff) && framed.route === route) return;
    framedRef.current = { pickup, dropoff, route };

    const points = [pickup, dropoff, ...(route?.path ?? [])].filter((point): point is Coordinates => Boolean(point));
    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(15);
    } else if (points.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, 56);
      // Two points on the same street shouldn't zoom in to rooftop level.
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() ?? 0) > 16) map.setZoom(16);
      });
    }
  }, [map, pickup, dropoff, route]);

  useEffect(
    () => () => {
      Object.values(markersRef.current).forEach((marker) => {
        if (marker) marker.map = null;
      });
      linesRef.current.forEach((line) => line.setMap(null));
    },
    [],
  );

  return (
    <div className={cn('relative overflow-hidden', className ?? 'h-80 w-full rounded-md')}>
      <div ref={containerRef} className="size-full" role="region" aria-label={t('routeLabel')} />
      {status === 'loading' ? (
        <div role="status" className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground animate-pulse">
          {t('loading')}
        </div>
      ) : null}
      {status === 'unavailable' ? (
        <div role="alert" className="absolute inset-0 flex items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">
          {t('servicesUnavailable')}
        </div>
      ) : null}
    </div>
  );
};

// A new map for each language: labels and control text are fixed when a
// map is created.
const RouteMap = (props: RouteMapProps) => <RouteMapCanvas key={useAppLocale()} {...props} />;

export default RouteMap;
