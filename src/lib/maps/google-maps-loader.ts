'use client';

import type { MapsLanguage } from '@/lib/maps/types';

// Loads the Maps JavaScript API once per page, the first time a map is
// shown, with only the libraries the app uses (maps, marker). Geocoding,
// search and routing never happen in the browser — they go through the
// server actions in lib/maps/actions.ts with the server-only key.
//
// The API's language (labels, controls) is fixed for the life of the page,
// so the language switcher reloads the page when a map has already loaded
// in the other language (googleMapsLanguage below).

type MapsWindow = Window & {
  gm_authFailure?: () => void;
  __parcellinkMapsReady?: () => void;
};

const CALLBACK = '__parcellinkMapsReady';

let loadPromise: Promise<void> | null = null;
let loadedLanguage: MapsLanguage | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

// Maps created with a Map ID get Google's vector map, Advanced Markers and
// any cloud styling attached to that ID. DEMO_MAP_ID is Google's shared
// development ID; production should set its own (SECURITY.md).
export const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

export const loadGoogleMaps = (language: MapsLanguage): Promise<void> => {
  if (loadPromise) return loadPromise;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured'));

  loadedLanguage = language;
  loadPromise = new Promise<void>((resolve, reject) => {
    const w = window as MapsWindow;
    // Google calls this when the key is refused (wrong referrer, API not
    // enabled, billing off). Maps then show a grey error box, which the
    // app's own "map unavailable" message replaces.
    w.gm_authFailure = () => {
      authFailed = true;
      console.error('Google Maps rejected NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (check its referrer and API restrictions)');
      authListeners.forEach((listener) => listener());
    };
    w[CALLBACK] = () => resolve();

    const params = new URLSearchParams({
      key,
      v: 'weekly',
      loading: 'async',
      libraries: 'maps,marker',
      language,
      region: 'AE',
      callback: CALLBACK,
    });
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    // Allowed by the CSP's 'strict-dynamic' (it's added by a trusted
    // script); the nonce also covers browsers without strict-dynamic.
    const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
    if (nonce) script.nonce = nonce;
    script.onerror = () => {
      // Let a later map try again (e.g. after the connection comes back).
      loadPromise = null;
      loadedLanguage = null;
      script.remove();
      reject(new Error('The Google Maps JavaScript API failed to load'));
    };
    document.head.append(script);
  });
  return loadPromise;
};

// The language the API was loaded in on this page, or null if no map has
// loaded yet.
export const googleMapsLanguage = () => loadedLanguage;

export const googleMapsAuthFailed = () => authFailed;

export const onGoogleMapsAuthFailure = (listener: () => void) => {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
};
