'use client';

import { useEffect, useRef, useState } from 'react';

import { useAppLocale } from '@/i18n/hooks';
import { GOOGLE_MAPS_MAP_ID, googleMapsAuthFailed, loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/maps/google-maps-loader';

export type GoogleMapStatus = 'loading' | 'ready' | 'unavailable';

// Google's standard map, kept close to its defaults so roads, buildings,
// parks, landmarks and business labels all stay visible. It follows the
// app's light/dark theme; brand colour comes from the markers and route.
const baseOptions = (): google.maps.MapOptions => ({
  mapId: GOOGLE_MAPS_MAP_ID,
  colorScheme: document.documentElement.classList.contains('dark') ? google.maps.ColorScheme.DARK : google.maps.ColorScheme.LIGHT,
  disableDefaultUI: true,
  zoomControl: true,
  // Logical position: the inline end is the left side in Arabic.
  zoomControlOptions: { position: google.maps.ControlPosition.INLINE_END_BLOCK_END },
  clickableIcons: true,
  // Bounded to around the Gulf so the map can't be panned off into nowhere.
  restriction: { latLngBounds: { south: 20, west: 48, north: 28.5, east: 59 }, strictBounds: false },
});

// Creates one map in containerRef once the API has loaded. The map is
// created once per mount (callers remount on a language change); `options`
// is read only then.
export const useGoogleMap = (options: () => google.maps.MapOptions) => {
  const locale = useAppLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [status, setStatus] = useState<GoogleMapStatus>(() => (googleMapsAuthFailed() ? 'unavailable' : 'loading'));
  const optionsRef = useRef(options);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onGoogleMapsAuthFailure(() => setStatus('unavailable'));

    loadGoogleMaps(locale)
      .then(() => {
        if (cancelled || !containerRef.current || googleMapsAuthFailed()) return;
        setMap(new google.maps.Map(containerRef.current, { ...baseOptions(), ...optionsRef.current() }));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        console.error('Map unavailable:', error instanceof Error ? error.message : error);
        if (!cancelled) setStatus('unavailable');
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // Once per mount; see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Google maps have no destroy(); dropping listeners lets it be collected.
  useEffect(() => () => {
    if (map) google.maps.event.clearInstanceListeners(map);
  }, [map]);

  return { containerRef, map, status };
};

// A brand-coloured Advanced Marker pin, optionally with a letter/glyph.
export const brandPin = (background: string, glyph?: string) =>
  new google.maps.marker.PinElement({
    background,
    borderColor: '#ffffff',
    glyphColor: '#ffffff',
    scale: 1.15,
    ...(glyph ? { glyphText: glyph } : {}),
  });
