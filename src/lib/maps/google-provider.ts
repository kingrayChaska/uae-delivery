import 'server-only';

import {
  MapsProviderError,
  ROUTING_PREFERENCE,
  buildAutocompleteRequest,
  buildForwardGeocodeRequest,
  buildPlaceDetailsRequest,
  buildReverseGeocodeRequest,
  buildRouteRequest,
  buildTextSearchRequest,
  isTooGeneral,
  parseAutocompleteResponse,
  parseForwardGeocodeLocation,
  parseForwardGeocodeResponse,
  parsePlaceDetailsResponse,
  parseReverseGeocodeResponse,
  parseRouteResponse,
  parseTextSearchResponse,
} from '@/lib/maps/google-client';
import { readSharedCache, writeSharedCache } from '@/lib/maps/shared-cache';

import type { ApiRequest } from '@/lib/maps/google-client';
import type { Coordinates } from '@/lib/types';
import type {
  AddressResolution,
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
// the same route minutes apart, with the same reference departure time:
// reuse the answer for an hour (on this instance, then the shared cache)
// so the booking is priced from exactly the route that was quoted, and
// Google is paid once. Failures aren't cached.
const ROUTE_CACHE_TTL_MS = 60 * 60 * 1000;
const ROUTE_CACHE_MAX_ENTRIES = 500;
const routeCache = new Map<string, { route: RouteResult; expires: number }>();
// Bump whenever buildRouteRequest changes what it asks Google for (travel
// mode, routing preference, modifiers, waypoint shape): routes cached
// under the old request are then never reused. v3: traffic-aware.
const ROUTE_CACHE_VERSION = 'v3';
// The cache key only: requests always carry the full-precision coordinates.
const waypointKey = ({ coordinates: { lat, lng }, placeId }: RouteWaypoint) =>
  `${lat.toFixed(7)},${lng.toFixed(7)},${placeId ?? ''}`;
const routeKey = (a: RouteWaypoint, b: RouteWaypoint) => `${ROUTE_CACHE_VERSION}|${waypointKey(a)}|${waypointKey(b)}`;

// One structured line per route, in every environment, for diagnosing a
// distance that differs from Google Maps: what was routed (Place ID or
// exact point), how, and what Google answered. Never the API key, and no
// addresses, names or phone numbers.
const describeWaypoint = ({ coordinates, placeId }: RouteWaypoint) => ({
  placeId: placeId ?? null,
  lat: coordinates.lat,
  lng: coordinates.lng,
});

const logRoute = (
  source: 'memory_cache' | 'shared_cache' | 'google',
  origin: RouteWaypoint,
  destination: RouteWaypoint,
  route: RouteResult,
  request?: ApiRequest,
) => {
  const sent = request?.body ? (JSON.parse(request.body) as { departureTime?: string }) : null;
  console.info('maps:route', {
    source,
    api: 'routes.computeRoutes',
    travelMode: 'DRIVE',
    routingPreference: ROUTING_PREFERENCE,
    departureTime: sent?.departureTime ?? null,
    cacheVersion: ROUTE_CACHE_VERSION,
    origin: describeWaypoint(origin),
    destination: describeWaypoint(destination),
    distanceMeters: route.distanceMeters,
    distanceKm: route.distanceKm,
    durationSeconds: route.durationSeconds,
  });
};

// The server's own look-ups of a place the customer already chose (the
// coverage check and the route's place check) ask for the same place
// within seconds; reuse it rather than pay twice. Customer searches carry
// a session token and are never cached.
const PLACE_CACHE_TTL_MS = 60 * 60 * 1000;
const PLACE_CACHE_MAX_ENTRIES = 1000;
const placeCache = new Map<string, { location: ResolvedLocation; expires: number }>();

// Bulk uploads repeat addresses constantly (one warehouse pickup for every
// row, the same customers week after week) and are processed in several
// requests, often on different server instances, so resolved addresses are
// reused for a day — here, then in the shared cache (lib/maps/shared-cache).
// Only successes are cached.
const ADDRESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ADDRESS_CACHE_MAX_ENTRIES = 5000;
const addressCache = new Map<string, { resolution: AddressResolution; expires: number }>();
const addressKey = (address: string) => address.trim().replace(/\s+/g, ' ').toLowerCase();

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

  // Merchant CSV upload: like geocode(), but keeps Google's structured
  // address and Place ID (coverage and routing use them) and says how sure
  // the match is. Throws when Google has nothing.
  resolveAddress: async (address: string): Promise<AddressResolution> => {
    const cacheKey = addressKey(address);
    const cached = addressCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.resolution;

    const remember = (resolution: AddressResolution) => {
      if (addressCache.size >= ADDRESS_CACHE_MAX_ENTRIES) addressCache.delete(addressCache.keys().next().value!);
      addressCache.set(cacheKey, { resolution, expires: Date.now() + ADDRESS_CACHE_TTL_MS });
      // The route's own place check asks for this place next; seed it.
      const placeId = resolution.location.place.placeId;
      if (placeId && !placeCache.has(`en|${placeId}`)) {
        if (placeCache.size >= PLACE_CACHE_MAX_ENTRIES) placeCache.delete(placeCache.keys().next().value!);
        placeCache.set(`en|${placeId}`, { location: resolution.location, expires: Date.now() + PLACE_CACHE_TTL_MS });
      }
      return resolution;
    };

    const shared = await readSharedCache<AddressResolution>(`address:${cacheKey}`);
    if (shared) return remember(shared);

    const key = getKey();
    const geocoded = parseForwardGeocodeLocation(await send(buildForwardGeocodeRequest(address, key)));
    let resolution: AddressResolution;
    if (geocoded && !isTooGeneral(geocoded.types)) {
      resolution = { location: geocoded.location, via: 'geocode', approximate: geocoded.partialMatch, tooGeneral: false };
    } else {
      // Building and business names ("Dubai Mall") are Places' strength.
      const [place] = parseTextSearchResponse(await send(buildTextSearchRequest(address, key, 'en', 1)));
      if (place?.resolved) {
        resolution = { location: place.resolved, via: 'text_search', approximate: false, tooGeneral: false };
      } else if (geocoded) {
        resolution = { location: geocoded.location, via: 'geocode', approximate: true, tooGeneral: true };
      } else {
        throw new MapsProviderError('No results found for that address');
      }
    }

    await writeSharedCache(`address:${cacheKey}`, resolution, ADDRESS_CACHE_TTL_MS);
    return remember(resolution);
  },

  reverseGeocode: async (coordinates: Coordinates, language: MapsLanguage = 'en'): Promise<ResolvedLocation> => {
    const json = await send(buildReverseGeocodeRequest(coordinates, getKey(), language));
    return parseReverseGeocodeResponse(json, coordinates, language);
  },

  getRoute: async (origin: RouteWaypoint, destination: RouteWaypoint): Promise<RouteResult> => {
    const key = routeKey(origin, destination);
    const cached = routeCache.get(key);
    if (cached && cached.expires > Date.now()) {
      logRoute('memory_cache', origin, destination, cached.route);
      return cached.route;
    }

    const remember = (route: RouteResult) => {
      if (routeCache.size >= ROUTE_CACHE_MAX_ENTRIES) routeCache.delete(routeCache.keys().next().value!);
      routeCache.set(key, { route, expires: Date.now() + ROUTE_CACHE_TTL_MS });
      return route;
    };

    // Another instance may already have priced this exact trip (the
    // wizard's quote and the booking often land on different instances).
    const shared = await readSharedCache<RouteResult>(`route:${key}`);
    if (shared) {
      logRoute('shared_cache', origin, destination, shared);
      return remember(shared);
    }

    const request = buildRouteRequest(origin, destination, getKey());
    const route = parseRouteResponse(await send(request));
    logRoute('google', origin, destination, route, request);
    await writeSharedCache(`route:${key}`, route, ROUTE_CACHE_TTL_MS);
    return remember(route);
  },
};
