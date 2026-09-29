'use server';

import { requireUser } from '@/lib/auth/guards';
import { RATE_LIMIT_MESSAGE, checkRateLimit } from '@/lib/security/rate-limit';
import { mapboxProvider, MapsProviderError } from '@/lib/maps/mapbox-provider';
import { locationRetrieveSchema, locationSearchSchema, reverseGeocodeSchema, routeRequestSchema } from '@/lib/maps/schemas';
import { BOOKING_ERRORS } from '@/lib/shipment/booking-guards';
import { SEARCH_UNAVAILABLE_MESSAGE } from '@/lib/maps/config';

import type { LocationRetrieveInput, LocationSearchInput, RouteRequestInput } from '@/lib/maps/schemas';
import type { LocationSuggestion, ResolvedLocation, RouteResult } from '@/lib/maps/types';
import type { Coordinates } from '@/lib/types';

// Every maps action calls a paid Mapbox API, so each requires a signed-in
// user and is rate limited per user — otherwise anyone could run up the bill.

export type LocationSearchResult = { success: true; suggestions: LocationSuggestion[] } | { success: false; error: string };

// Search Box first (it knows buildings, towers, malls, warehouses and other
// POIs, as well as addresses and streets). If it fails, fall back to the
// Geocoding API so search keeps working, just with fewer places.
export const searchLocationsAction = async (input: LocationSearchInput): Promise<LocationSearchResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = locationSearchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Enter a place to search for' };
  const { query, sessionToken, proximity } = parsed.data;

  try {
    const suggestions = await mapboxProvider.suggest(query, sessionToken, proximity);
    if (suggestions.length > 0) return { success: true, suggestions };
  } catch (error) {
    if (error instanceof MapsProviderError) console.error('Search Box suggest failed, falling back to geocoding', error.message);
  }

  try {
    return { success: true, suggestions: await mapboxProvider.searchPlaces(query, proximity) };
  } catch (error) {
    if (error instanceof MapsProviderError) console.error('Location search failed', error.message);
    return { success: false, error: SEARCH_UNAVAILABLE_MESSAGE };
  }
};

export type ResolveLocationResult = { success: true; location: ResolvedLocation } | { success: false; error: string };

export const retrieveLocationAction = async (input: LocationRetrieveInput): Promise<ResolveLocationResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = locationRetrieveSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'That place could not be loaded' };

  try {
    return { success: true, location: await mapboxProvider.retrieve(parsed.data.id, parsed.data.sessionToken) };
  } catch (error) {
    if (error instanceof MapsProviderError) console.error('Search Box retrieve failed', error.message);
    return { success: false, error: 'That place could not be loaded. Try another result or drop a pin on the map.' };
  }
};

// Describes a dropped pin or the device's location. A failure here is not
// fatal: the caller keeps the coordinates and asks for address details.
export const reverseGeocodeAction = async (input: Coordinates): Promise<ResolveLocationResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = reverseGeocodeSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid coordinates' };

  try {
    return { success: true, location: await mapboxProvider.reverseGeocode(parsed.data) };
  } catch (error) {
    if (error instanceof MapsProviderError) console.error('Reverse geocoding failed', error.message);
    return { success: false, error: 'Address lookup failed' };
  }
};

export type GetRouteResult = { success: true; route: RouteResult } | { success: false; error: string };

export const getRouteAction = async (input: RouteRequestInput): Promise<GetRouteResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = routeRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid coordinates' };

  try {
    const route = await mapboxProvider.getRoute(parsed.data.origin, parsed.data.destination);
    return { success: true, route };
  } catch (error) {
    if (error instanceof MapsProviderError) console.error('Route calculation failed', error.message);
    return { success: false, error: BOOKING_ERRORS.routeFailed };
  }
};
