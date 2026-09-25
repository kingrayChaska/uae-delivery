import 'server-only';

import {
  MapsProviderError,
  buildDirectionsUrl,
  buildForwardGeocodeUrl,
  buildReverseGeocodeUrl,
  parseDirectionsResponse,
  parseGeocodeResponse,
  parseSingleGeocodeResponse,
} from '@/lib/maps/mapbox-client';

import type { Coordinates } from '@/lib/types';
import type { GeocodeResult, MapsProvider, RouteResult } from '@/lib/maps/types';

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
    response = await fetch(url);
  } catch {
    throw new MapsProviderError('Unable to reach the maps service. Please try again.');
  }

  if (!response.ok) {
    throw new MapsProviderError('The maps service returned an error. Please try again.');
  }

  return response.json();
};

export { MapsProviderError };

export const mapboxProvider: MapsProvider = {
  autocomplete: async (query: string): Promise<GeocodeResult[]> => {
    if (query.trim().length < 3) return [];
    const json = await fetchJson(buildForwardGeocodeUrl(query, getToken(), { autocomplete: true }));
    return parseGeocodeResponse(json);
  },

  geocode: async (address: string): Promise<GeocodeResult> => {
    const json = await fetchJson(buildForwardGeocodeUrl(address, getToken(), { limit: 1 }));
    return parseSingleGeocodeResponse(json);
  },

  reverseGeocode: async (coordinates: Coordinates): Promise<GeocodeResult> => {
    const json = await fetchJson(buildReverseGeocodeUrl(coordinates, getToken()));
    return parseSingleGeocodeResponse(json);
  },

  getRoute: async (origin: Coordinates, destination: Coordinates): Promise<RouteResult> => {
    const json = await fetchJson(buildDirectionsUrl(origin, destination, getToken()));
    return parseDirectionsResponse(json);
  },
};
