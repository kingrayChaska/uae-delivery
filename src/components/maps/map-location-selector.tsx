'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Crosshair } from 'lucide-react';

import { BRAND } from '@/lib/brand';

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
const MapLocationSelector = ({ initial, initialZoom, onMove, className = '' }: MapLocationSelectorProps) => {
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
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

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
        The map couldn’t load. Search for the address instead, or try again later.
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="size-full"
        role="application"
        aria-label="Map. Drag the pin, tap the map, or pan with the arrow keys and use Put pin at map centre."
      />
      <button
        type="button"
        onClick={pinAtCentre}
        className="absolute bottom-3 left-3 flex min-h-10 items-center gap-2 rounded-lg bg-background/95 px-3 text-sm font-medium shadow-md ring-1 ring-border transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Crosshair className="size-4 text-primary" aria-hidden />
        Put pin at map centre
      </button>
    </div>
  );
};

export default MapLocationSelector;
