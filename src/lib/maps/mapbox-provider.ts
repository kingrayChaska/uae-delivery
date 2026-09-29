import 'server-only';

import {
  MapsProviderError,
  buildDirectionsUrl,
  buildForwardGeocodeUrl,
  buildRetrieveUrl,
  buildReverseGeocodeUrl,
  buildSuggestUrl,
  parseDirectionsResponse,
  parseGeocodeSuggestions,
  parseRetrieveResponse,
  parseReverseGeocodeResponse,
  parseSingleGeocodeResponse,
  parseSuggestResponse,
} from '@/lib/maps/mapbox-client';

import type { Coordinates } from '@/lib/types';
import type { GeocodeResult, LocationSuggestion, MapsProvider, ResolvedLocation, RouteResult } from '@/lib/maps/types';

// Server-only: MAPBOX_SECRET_TOKEN never reaches the browser. The browser
// only uses NEXT_PUBLIC_MAPBOX_TOKEN to draw map tiles.
const getToken = () => {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) {
    throw new MapsProviderError('MAPBOX_SECRET_TOKEN is not configured');
  }
  return token;
};

const fetchJson = async (url: string) => {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new MapsProviderError('Unable to reach the maps service. Please try again.');
  }

  if (!response.ok) {
    throw new MapsProviderError(`The maps service returned an error (${response.status}). Please try again.`);
  }

  return response.json();
};

export { MapsProviderError };

export const mapboxProvider: MapsProvider = {
  suggest: async (query: string, sessionToken: string, proximity?: Coordinates): Promise<LocationSuggestion[]> => {
    const json = await fetchJson(buildSuggestUrl(query, getToken(), sessionToken, proximity));
    return parseSuggestResponse(json);
  },

  retrieve: async (id: string, sessionToken: string): Promise<ResolvedLocation> => {
    const json = await fetchJson(buildRetrieveUrl(id, getToken(), sessionToken));
    return parseRetrieveResponse(json);
  },

  // Geocoding-based search: the fallback when Search Box is unavailable.
  searchPlaces: async (query: string, proximity?: Coordinates): Promise<LocationSuggestion[]> => {
    const json = await fetchJson(buildForwardGeocodeUrl(query, getToken(), { autocomplete: true, limit: 6, proximity }));
    return parseGeocodeSuggestions(json);
  },

  geocode: async (address: string): Promise<GeocodeResult> => {
    const json = await fetchJson(buildForwardGeocodeUrl(address, getToken(), { limit: 1 }));
    return parseSingleGeocodeResponse(json);
  },

  reverseGeocode: async (coordinates: Coordinates): Promise<ResolvedLocation> => {
    const json = await fetchJson(buildReverseGeocodeUrl(coordinates, getToken()));
    return parseReverseGeocodeResponse(json, coordinates);
  },

  getRoute: async (origin: Coordinates, destination: Coordinates): Promise<RouteResult> => {
    const json = await fetchJson(buildDirectionsUrl(origin, destination, getToken()));
    return parseDirectionsResponse(json);
  },
};
