import type { Coordinates } from '@/lib/types';

export type GeocodeResult = {
  formattedAddress: string;
  coordinates: Coordinates;
};

export type RouteResult = {
  distanceKm: number;
  durationMinutes: number;
  // A GeoJSON LineString — directly usable as a mapbox-gl source, no
  // client-side polyline decoding needed.
  geometry: { type: 'LineString'; coordinates: [number, number][] };
};

// Implemented in Phase 6 against the Mapbox Geocoding + Directions APIs.
// Pricing (lib/pricing) depends only on RouteResult.distanceKm, calculated
// server-side from the actual road route — never straight-line distance.
export type MapsProvider = {
  autocomplete: (query: string) => Promise<GeocodeResult[]>;
  geocode: (address: string) => Promise<GeocodeResult>;
  reverseGeocode: (coordinates: Coordinates) => Promise<GeocodeResult>;
  getRoute: (origin: Coordinates, destination: Coordinates) => Promise<RouteResult>;
};
