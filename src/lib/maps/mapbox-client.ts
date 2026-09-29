import { UAE_BBOX } from '@/lib/maps/config';

import type { Coordinates } from '@/lib/types';
import type { GeocodeResult, LocationSuggestion, PlaceDetails, ResolvedLocation, RouteResult } from '@/lib/maps/types';

// MAPBOX_API_URL exists only so the end-to-end suite can point at a local
// fake (e2e/stack/fake-mapbox.mjs). Unset in real deployments.
const apiBase = () => process.env.MAPBOX_API_URL || 'https://api.mapbox.com';
const geocodingBase = () => `${apiBase()}/search/geocode/v6`;
const searchBoxBase = () => `${apiBase()}/search/searchbox/v1`;
const directionsBase = () => `${apiBase()}/directions/v5/mapbox/driving`;

export class MapsProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapsProviderError';
  }
}

// ── Display helpers ─────────────────────────────────────────────────────────
// Mapbox's UAE text often carries P.O. box numbers as "postcodes"
// ("Dubai, 2344, United Arab Emirates") and repeats emirate names. Customers
// see a clean "Dubai Marina, Dubai, UAE" instead.

const COUNTRY_NAMES = /^(united arab emirates|uae)$/i;

const tidy = (value: string | null | undefined) => {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
};

export const joinPlaceParts = (parts: (string | null | undefined)[], { withCountry = true } = {}) => {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const value = tidy(part);
    if (!value || /^\d+$/.test(value) || COUNTRY_NAMES.test(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(value);
  }
  if (withCountry) kept.push('UAE');
  return kept.join(', ');
};

// Fallback when a response has no structured context: split Mapbox's own
// formatted string and clean it the same way.
export const cleanPlaceText = (text: string | null | undefined, { withCountry = true } = {}) =>
  joinPlaceParts((text ?? '').split(','), { withCountry });

type ContextEntry = { name?: string } | undefined;
type RegionEntry = { name?: string; region_code?: string; region_code_full?: string } | undefined;
type MapboxContext = {
  address?: { name?: string; street_name?: string };
  street?: ContextEntry;
  neighborhood?: ContextEntry;
  locality?: ContextEntry;
  district?: ContextEntry;
  place?: ContextEntry;
  region?: RegionEntry;
  postcode?: ContextEntry;
  country?: ContextEntry;
};

const titleCase = (value: string) => value.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export const placeFromContext = (name: string | null, context: MapboxContext | undefined): PlaceDetails => {
  const street = tidy(context?.address?.name) ?? tidy(context?.street?.name);
  return {
    name: tidy(name),
    // Search Box lower-cases street names in some contexts.
    street: street && street === street.toLowerCase() ? titleCase(street) : street,
    neighborhood: tidy(context?.neighborhood?.name) ?? tidy(context?.locality?.name),
    district: tidy(context?.district?.name),
    city: tidy(context?.place?.name),
    region: tidy(context?.region?.name),
    regionCode: tidy(context?.region?.region_code_full) ?? tidy(context?.region?.region_code),
    postcode: tidy(context?.postcode?.name),
    country: tidy(context?.country?.name),
  };
};

// "Marina Gate, King Salman Bin Abdulaziz Al Saud St, Marsa Dubai, Dubai, UAE"
export const formatPlace = (place: PlaceDetails) =>
  joinPlaceParts([place.name, place.street, place.neighborhood, place.district, place.city ?? place.region]);

// The line under a suggestion's name.
const secondaryLine = (name: string, context: MapboxContext | undefined, fallbackText: string | undefined) => {
  const place = placeFromContext(null, context);
  const structured = joinPlaceParts([place.neighborhood, place.city ?? place.region]);
  const candidate = structured !== 'UAE' ? structured : cleanPlaceText(fallbackText);
  // Don't repeat the name ("Dubai Marina" / "Dubai Marina, UAE").
  return joinPlaceParts(candidate.split(',').filter((part) => part.trim().toLowerCase() !== name.toLowerCase()));
};

// ── Search Box API: suggest + retrieve (POIs, buildings, addresses) ─────────
// The Geocoding API doesn't index points of interest, so buildings, malls,
// towers, hotels and warehouses were unfindable. Search Box covers them as
// well as addresses, streets and neighbourhoods. suggest/retrieve share a
// session token, which Mapbox bills as one search session.

export const buildSuggestUrl = (query: string, token: string, sessionToken: string, proximity?: Coordinates) => {
  const params = new URLSearchParams({
    q: query,
    access_token: token,
    session_token: sessionToken,
    country: 'ae',
    language: 'en',
    limit: '8',
    bbox: UAE_BBOX.join(','),
  });
  if (proximity) params.set('proximity', `${proximity.lng},${proximity.lat}`);
  return `${searchBoxBase()}/suggest?${params.toString()}`;
};

type SuggestResponse = {
  suggestions?: {
    mapbox_id: string;
    name: string;
    feature_type: string;
    place_formatted?: string;
    full_address?: string;
    context?: MapboxContext;
  }[];
};

// Category/brand rows ("Restaurants", "Starbucks") aren't places — selecting
// one would need a second search — so they're left out.
const NOT_A_PLACE = new Set(['category', 'brand', 'country']);

export const parseSuggestResponse = (json: SuggestResponse): LocationSuggestion[] =>
  (json.suggestions ?? [])
    .filter((s) => s.mapbox_id && s.name && !NOT_A_PLACE.has(s.feature_type))
    .map((s) => ({
      id: s.mapbox_id,
      name: tidy(s.name) ?? s.name,
      secondary: secondaryLine(s.name, s.context, s.place_formatted ?? s.full_address),
      featureType: s.feature_type,
      resolved: null,
    }));

export const buildRetrieveUrl = (id: string, token: string, sessionToken: string) => {
  const params = new URLSearchParams({ access_token: token, session_token: sessionToken, language: 'en' });
  return `${searchBoxBase()}/retrieve/${encodeURIComponent(id)}?${params.toString()}`;
};

type RetrieveResponse = {
  features?: {
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { name?: string; feature_type?: string; context?: MapboxContext };
  }[];
};

export const parseRetrieveResponse = (json: RetrieveResponse): ResolvedLocation => {
  const [feature] = json.features ?? [];
  if (!feature) throw new MapsProviderError('That place could not be found');
  const [lng, lat] = feature.geometry.coordinates;
  const isArea = ['neighborhood', 'locality', 'place', 'district', 'region'].includes(feature.properties.feature_type ?? '');
  const place = placeFromContext(isArea ? null : (feature.properties.name ?? null), feature.properties.context);
  // An area's own name lives in its context slot (e.g. neighborhood).
  if (isArea && !place.neighborhood) place.neighborhood = tidy(feature.properties.name);
  return { coordinates: { lat, lng }, formattedAddress: formatPlace(place), place };
};

// ── Geocoding v6: forward (fallback search, CSV import) and reverse ─────────

export const buildForwardGeocodeUrl = (
  query: string,
  token: string,
  opts?: { limit?: number; autocomplete?: boolean; proximity?: Coordinates },
) => {
  const params = new URLSearchParams({
    q: query,
    access_token: token,
    country: 'ae',
    language: 'en',
    bbox: UAE_BBOX.join(','),
    limit: String(opts?.limit ?? 5),
    autocomplete: String(opts?.autocomplete ?? true),
  });
  if (opts?.proximity) params.set('proximity', `${opts.proximity.lng},${opts.proximity.lat}`);
  return `${geocodingBase()}/forward?${params.toString()}`;
};

type GeocodeFeature = {
  id?: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    mapbox_id?: string;
    feature_type?: string;
    full_address?: string;
    name?: string;
    place_formatted?: string;
    context?: MapboxContext;
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

const featureToResolved = (feature: GeocodeFeature): ResolvedLocation => {
  const [lng, lat] = feature.geometry.coordinates;
  const context = feature.properties.context;
  const place = placeFromContext(feature.properties.feature_type === 'street' ? null : (feature.properties.name ?? null), context);
  const formattedAddress = context
    ? formatPlace(place)
    : cleanPlaceText(feature.properties.full_address ?? [feature.properties.name, feature.properties.place_formatted].join(','));
  return { coordinates: { lat, lng }, formattedAddress, place };
};

export const parseGeocodeResponse = (json: GeocodeResponse): GeocodeResult[] => {
  return (json.features ?? []).map(featureToGeocodeResult);
};

export const parseSingleGeocodeResponse = (json: GeocodeResponse): GeocodeResult => {
  const [first] = json.features ?? [];
  if (!first) throw new MapsProviderError('No results found for that address');
  return featureToGeocodeResult(first);
};

// Geocoding results as dropdown rows, already carrying their coordinates.
export const parseGeocodeSuggestions = (json: GeocodeResponse): LocationSuggestion[] =>
  (json.features ?? []).map((feature, index) => {
    const name = tidy(feature.properties.name) ?? 'Location';
    return {
      id: feature.properties.mapbox_id ?? feature.id ?? `geocode-${index}`,
      name,
      secondary: secondaryLine(name, feature.properties.context, feature.properties.place_formatted),
      featureType: feature.properties.feature_type ?? 'address',
      resolved: featureToResolved(feature),
    };
  });

export const buildReverseGeocodeUrl = (coordinates: Coordinates, token: string) => {
  const params = new URLSearchParams({
    longitude: String(coordinates.lng),
    latitude: String(coordinates.lat),
    access_token: token,
    language: 'en',
    limit: '1',
  });
  return `${geocodingBase()}/reverse?${params.toString()}`;
};

// Keeps the exact coordinates that were asked about (a dropped pin), and
// uses Mapbox only to describe them.
export const parseReverseGeocodeResponse = (json: GeocodeResponse, coordinates: Coordinates): ResolvedLocation => {
  const [first] = json.features ?? [];
  if (!first) throw new MapsProviderError('No address found at that point');
  return { ...featureToResolved(first), coordinates };
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
