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
import type {
  GeocodeResult,
  LocationSuggestion,
  MapsLanguage,
  MapsProvider,
  ResolvedLocation,
  RouteResult,
  RouteWaypoint,
} from '@/lib/maps/types';

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
// The cache key only: requests always carry the full-precision coordinates.
const waypointKey = ({ coordinates: { lat, lng }, placeId }: RouteWaypoint) =>
  `${lat.toFixed(7)},${lng.toFixed(7)},${placeId ?? ''}`;
const routeKey = (a: RouteWaypoint, b: RouteWaypoint) => `${waypointKey(a)}|${waypointKey(b)}`;

// The server's own look-ups of a place the customer already chose (the
// coverage check and the route's place check) ask for the same place
// within seconds; reuse it rather than pay twice. Customer searches carry
// a session token and are never cached.
const PLACE_CACHE_TTL_MS = 60 * 60 * 1000;
const PLACE_CACHE_MAX_ENTRIES = 1000;
const placeCache = new Map<string, { location: ResolvedLocation; expires: number }>();

export const googleMapsProvider: MapsProvider = {
  suggest: async (query: string, sessionToken: string, language: MapsLanguage, proximity?: Coordinates): Promise<LocationSuggestion[]> => {
    const json = await send(buildAutocompleteRequest(query, getKey(), sessionToken, language, proximity));
    return parseAutocompleteResponse(json, language);
  },

  retrieve: async (id: string, sessionToken: string | null, language: MapsLanguage): Promise<ResolvedLocation> => {
    const key = `${language}|${id}`;
    const cached = sessionToken ? null : placeCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.location;

    const json = await send(buildPlaceDetailsRequest(id, getKey(), sessionToken, language));
    const location = parsePlaceDetailsResponse(json, language);
    if (!sessionToken) {
      if (placeCache.size >= PLACE_CACHE_MAX_ENTRIES) placeCache.delete(placeCache.keys().next().value!);
      placeCache.set(key, { location, expires: Date.now() + PLACE_CACHE_TTL_MS });
    }
    return location;
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

  getRoute: async (origin: RouteWaypoint, destination: RouteWaypoint): Promise<RouteResult> => {
    const key = routeKey(origin, destination);
    const cached = routeCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.route;

    const route = parseRouteResponse(await send(buildRouteRequest(origin, destination, getKey())));
    if (routeCache.size >= ROUTE_CACHE_MAX_ENTRIES) routeCache.delete(routeCache.keys().next().value!);
    routeCache.set(key, { route, expires: Date.now() + ROUTE_CACHE_TTL_MS });
    return route;
  },
};
