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

// How the customer chose a location. Coordinates are authoritative in every
// case; the address text is a best-effort description of them.
export const LOCATION_SOURCES = ['search', 'pin', 'current_location'] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

// Human-readable parts of a place, where Mapbox knows them.
export type PlaceDetails = {
  name: string | null;
  street: string | null;
  neighborhood: string | null;
  district: string | null;
  city: string | null;
  region: string | null;
  // ISO 3166-2 code of the region, e.g. "AE-DU" — how the emirate is identified.
  regionCode: string | null;
  postcode: string | null;
  country: string | null;
};

export type ResolvedLocation = {
  coordinates: Coordinates;
  formattedAddress: string;
  place: PlaceDetails;
};

// One row in the location search dropdown. Search Box suggestions carry no
// coordinates until retrieved; fallback (Geocoding) suggestions arrive
// already resolved.
export type LocationSuggestion = {
  id: string;
  name: string;
  // e.g. "Dubai Marina, Dubai, UAE"
  secondary: string;
  featureType: string;
  resolved: ResolvedLocation | null;
};

// Implemented against the Mapbox Search Box, Geocoding v6 and Directions
// v5 APIs. Pricing (lib/pricing) depends only on RouteResult.distanceKm,
// calculated server-side from the actual road route between the chosen
// coordinates — never straight-line distance, never the address text.
export type MapsProvider = {
  suggest: (query: string, sessionToken: string, proximity?: Coordinates) => Promise<LocationSuggestion[]>;
  retrieve: (id: string, sessionToken: string) => Promise<ResolvedLocation>;
  searchPlaces: (query: string, proximity?: Coordinates) => Promise<LocationSuggestion[]>;
  geocode: (address: string) => Promise<GeocodeResult>;
  reverseGeocode: (coordinates: Coordinates) => Promise<ResolvedLocation>;
  getRoute: (origin: Coordinates, destination: Coordinates) => Promise<RouteResult>;
};
