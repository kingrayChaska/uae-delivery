import { UAE_BBOX } from '@/lib/maps/config';

import type { Coordinates } from '@/lib/types';
import type { GeocodeResult, RouteResult } from '@/lib/maps/types';

// MAPBOX_API_URL exists only so the end-to-end suite can point at a local
// fake (e2e/stack/fake-mapbox.mjs). Unset in real deployments.
const apiBase = () => process.env.MAPBOX_API_URL || 'https://api.mapbox.com';
const geocodingBase = () => `${apiBase()}/search/geocode/v6`;
const directionsBase = () => `${apiBase()}/directions/v5/mapbox/driving`;

export class MapsProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapsProviderError';
  }
}

// ── Forward geocoding / autocomplete ────────────────────────────────────────
// Mapbox's v6 forward endpoint serves both a full geocode and type-ahead
// autocomplete (the `autocomplete` param just tunes ranking for partial
// input) — one endpoint, two callers (lib/maps/mapbox-provider.ts).

export const buildForwardGeocodeUrl = (
  query: string,
  token: string,
  opts?: { limit?: number; autocomplete?: boolean },
) => {
  const params = new URLSearchParams({
    q: query,
    access_token: token,
    country: 'ae',
    bbox: UAE_BBOX.join(','),
    limit: String(opts?.limit ?? 5),
    autocomplete: String(opts?.autocomplete ?? true),
  });
  return `${geocodingBase()}/forward?${params.toString()}`;
};

type GeocodeFeature = {
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    full_address?: string;
    name?: string;
    place_formatted?: string;
  };
};

type GeocodeResponse = {
  features?: GeocodeFeature[];
};

const featureToGeocodeResult = (feature: GeocodeFeature): GeocodeResult => {
  const [lng, lat] = feature.geometry.coordinates;
  const label =
    feature.properties.full_address ??
    [feature.properties.name, feature.properties.place_formatted].filter(Boolean).join(', ');

  return {
    formattedAddress: label,
    coordinates: { lat, lng },
  };
};

export const parseGeocodeResponse = (json: GeocodeResponse): GeocodeResult[] => {
  return (json.features ?? []).map(featureToGeocodeResult);
};

export const parseSingleGeocodeResponse = (json: GeocodeResponse): GeocodeResult => {
  const [first] = json.features ?? [];
  if (!first) throw new MapsProviderError('No results found for that address');
  return featureToGeocodeResult(first);
};

// ── Reverse geocoding ────────────────────────────────────────────────────────

export const buildReverseGeocodeUrl = (coordinates: Coordinates, token: string) => {
  const params = new URLSearchParams({
    longitude: String(coordinates.lng),
    latitude: String(coordinates.lat),
    access_token: token,
  });
  return `${geocodingBase()}/reverse?${params.toString()}`;
};

// ── Directions / routing ─────────────────────────────────────────────────────

export const buildDirectionsUrl = (origin: Coordinates, destination: Coordinates, token: string) => {
  const coordinatePair = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const params = new URLSearchParams({
    access_token: token,
    geometries: 'geojson',
    overview: 'full',
  });
  return `${directionsBase()}/${coordinatePair}?${params.toString()}`;
};

type DirectionsResponse = {
  code?: string;
  routes?: {
    distance: number; // meters
    duration: number; // seconds
    geometry: { type: 'LineString'; coordinates: [number, number][] };
  }[];
};

export const parseDirectionsResponse = (json: DirectionsResponse): RouteResult => {
  const [route] = json.routes ?? [];
  if (json.code !== 'Ok' || !route) {
    throw new MapsProviderError('Unable to calculate a route between these locations');
  }

  return {
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
    geometry: route.geometry,
  };
};
