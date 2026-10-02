import type { Coordinates } from '@/lib/types';

export type GeocodeResult = {
  formattedAddress: string;
  coordinates: Coordinates;
};

export type RouteResult = {
  distanceKm: number;
  durationMinutes: number;
  // The driving route as points along the road, decoded on the server from
  // Google's encoded polyline — drawn directly as a google.maps.Polyline.
  path: Coordinates[];
};

// How the customer chose a location. Coordinates are authoritative in every
// case; the address text is a best-effort description of them.
export const LOCATION_SOURCES = ['search', 'pin', 'current_location'] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

// The languages Google is asked to describe places in (the app's locales).
export const MAPS_LANGUAGES = ['en', 'ar'] as const;
export type MapsLanguage = (typeof MAPS_LANGUAGES)[number];

// Human-readable parts of a place, where Google knows them.
export type PlaceDetails = {
  // Google Place ID of the chosen place (search), or of the nearest address
  // Google found for a dropped pin. Null when Google had nothing to offer.
  placeId: string | null;
  name: string | null;
  street: string | null;
  neighborhood: string | null;
  district: string | null;
  city: string | null;
  region: string | null;
  // ISO 3166-2 code of the region, e.g. "AE-DU", when known. Google reports
  // the emirate by name (administrative_area_level_1), which is what
  // lib/service-areas matches on; older Mapbox-era rows carry the code.
  regionCode: string | null;
  postcode: string | null;
  country: string | null;
  // ISO 3166-1 code ("AE"): says "inside the UAE" in any language.
  countryCode?: string | null;
};

export type ResolvedLocation = {
  coordinates: Coordinates;
  formattedAddress: string;
  place: PlaceDetails;
};

// One row in the location search dropdown. Autocomplete predictions carry
// no coordinates until their Place Details are fetched; Text Search
// (fallback) results arrive already resolved.
export type LocationSuggestion = {
  id: string;
  name: string;
  // e.g. "Dubai Marina, Dubai, UAE"
  secondary: string;
  // 'poi' | 'address' | 'street' | 'area' — picks the row's icon.
  featureType: string;
  resolved: ResolvedLocation | null;
};

// Implemented against Google's Places API (New), Geocoding API and Routes
// API. Pricing (lib/pricing) depends only on RouteResult.distanceKm,
// calculated server-side from the actual road route between the chosen
// coordinates — never straight-line distance, never the address text.
export type MapsProvider = {
  suggest: (query: string, sessionToken: string, language: MapsLanguage, proximity?: Coordinates) => Promise<LocationSuggestion[]>;
  retrieve: (id: string, sessionToken: string | null, language: MapsLanguage) => Promise<ResolvedLocation>;
  searchPlaces: (query: string, language: MapsLanguage) => Promise<LocationSuggestion[]>;
  geocode: (address: string) => Promise<GeocodeResult>;
  reverseGeocode: (coordinates: Coordinates, language?: MapsLanguage) => Promise<ResolvedLocation>;
  getRoute: (origin: Coordinates, destination: Coordinates) => Promise<RouteResult>;
};
