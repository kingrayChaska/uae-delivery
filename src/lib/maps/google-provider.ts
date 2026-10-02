import 'server-only';

import {
  MapsProviderError,
  buildAutocompleteRequest,
  buildForwardGeocodeRequest,
  buildPlaceDetailsRequest,
  buildReverseGeocodeRequest,
  buildRouteRequest,
  buildTextSearchRequest,
  parseAutocompleteResponse,
  parseForwardGeocodeResponse,
  parsePlaceDetailsResponse,
  parseReverseGeocodeResponse,
  parseRouteResponse,
  parseTextSearchResponse,
} from '@/lib/maps/google-client';

import type { ApiRequest } from '@/lib/maps/google-client';
import type { Coordinates } from '@/lib/types';
import type { GeocodeResult, LocationSuggestion, MapsLanguage, MapsProvider, ResolvedLocation, RouteResult } from '@/lib/maps/types';

// Prefer the server-only key. The fallbacks keep existing deployments
// working while they migrate from a single Google Maps key to separate
// browser and server credentials. `||`, not `??`: a blank line in .env
// ("GOOGLE_MAPS_SERVER_API_KEY=") is an empty string, which must fall
// through — otherwise every call goes out keyless and every location's
// emirate check fails.
const getKey = () => {
  const key =
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new MapsProviderError('A Google Maps API key is not configured');
  }
  return key;
};

// Google's error bodies ({ error: { status, message } }) go to server logs
// via MapsProviderError; customers only ever see the app's own wording.
const send = async (request: ApiRequest) => {
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new MapsProviderError('Unable to reach Google Maps Platform');
  }

  if (!response.ok) {
    const detail = await response
      .json()
      .then((json: { error?: { status?: string; message?: string } }) => [json.error?.status, json.error?.message].filter(Boolean).join(': '))
      .catch(() => '');
    throw new MapsProviderError(`Google Maps Platform returned ${response.status}${detail ? ` (${detail})` : ''}`);
  }

  return response.json();
};

export { MapsProviderError };

// The booking wizard's quote and the booking itself (quoteShipment) ask for
// the same route minutes apart. Routes are traffic-unaware, so the answer
// is the same: reuse it for an hour (per server instance) rather than pay
// for it twice. Failures aren't cached.
const ROUTE_CACHE_TTL_MS = 60 * 60 * 1000;
const ROUTE_CACHE_MAX_ENTRIES = 500;
const routeCache = new Map<string, { route: RouteResult; expires: number }>();
const routeKey = (a: Coordinates, b: Coordinates) =>
  `${a.lat.toFixed(6)},${a.lng.toFixed(6)}|${b.lat.toFixed(6)},${b.lng.toFixed(6)}`;

export const googleMapsProvider: MapsProvider = {
  suggest: async (query: string, sessionToken: string, language: MapsLanguage, proximity?: Coordinates): Promise<LocationSuggestion[]> => {
    const json = await send(buildAutocompleteRequest(query, getKey(), sessionToken, language, proximity));
    return parseAutocompleteResponse(json, language);
  },

  retrieve: async (id: string, sessionToken: string | null, language: MapsLanguage): Promise<ResolvedLocation> => {
    const json = await send(buildPlaceDetailsRequest(id, getKey(), sessionToken, language));
    return parsePlaceDetailsResponse(json, language);
  },

  // Text Search: the fallback when Autocomplete has no predictions.
  searchPlaces: async (query: string, language: MapsLanguage): Promise<LocationSuggestion[]> => {
    const json = await send(buildTextSearchRequest(query, getKey(), language));
    return parseTextSearchResponse(json, language);
  },

  // Staff CSV import: the Geocoding API for postal-style addresses, then
  // Text Search for what it doesn't know (building and business names).
  geocode: async (address: string): Promise<GeocodeResult> => {
    const key = getKey();
    const geocoded = parseForwardGeocodeResponse(await send(buildForwardGeocodeRequest(address, key)));
    if (geocoded) return geocoded;
    const [place] = parseTextSearchResponse(await send(buildTextSearchRequest(address, key, 'en', 1)));
    if (!place?.resolved) throw new MapsProviderError('No results found for that address');
    return { formattedAddress: place.resolved.formattedAddress, coordinates: place.resolved.coordinates };
  },

  reverseGeocode: async (coordinates: Coordinates, language: MapsLanguage = 'en'): Promise<ResolvedLocation> => {
    const json = await send(buildReverseGeocodeRequest(coordinates, getKey(), language));
    return parseReverseGeocodeResponse(json, coordinates, language);
  },

  getRoute: async (origin: Coordinates, destination: Coordinates): Promise<RouteResult> => {
    const key = routeKey(origin, destination);
    const cached = routeCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.route;

    const route = parseRouteResponse(await send(buildRouteRequest(origin, destination, getKey())));
    if (routeCache.size >= ROUTE_CACHE_MAX_ENTRIES) routeCache.delete(routeCache.keys().next().value!);
    routeCache.set(key, { route, expires: Date.now() + ROUTE_CACHE_TTL_MS });
    return route;
  },
};
