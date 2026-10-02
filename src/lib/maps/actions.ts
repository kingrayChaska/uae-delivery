'use server';

import { requireUser } from '@/lib/auth/guards';
import { RATE_LIMIT_MESSAGE, checkRateLimit } from '@/lib/security/rate-limit';
import { googleMapsProvider, MapsProviderError } from '@/lib/maps/google-provider';
import { locationRetrieveSchema, locationSearchSchema, reverseGeocodeSchema, routeRequestSchema } from '@/lib/maps/schemas';
import { BOOKING_ERRORS } from '@/lib/shipment/booking-guards';
import { SEARCH_UNAVAILABLE_MESSAGE } from '@/lib/maps/config';

import type { LocationRetrieveInput, LocationSearchInput, ReverseGeocodeInput, RouteRequestInput } from '@/lib/maps/schemas';
import type { LocationSuggestion, ResolvedLocation, RouteResult } from '@/lib/maps/types';

// Every maps action calls a paid Google API, so each requires a signed-in
// user and is rate limited per user — otherwise anyone could run up the bill.
// Google's own error text goes to server logs only.

const logFailure = (what: string, error: unknown) => {
  console.error(what, error instanceof MapsProviderError ? error.message : error);
};

export type LocationSearchResult = { success: true; suggestions: LocationSuggestion[] } | { success: false; error: string };

// Places Autocomplete first (businesses, buildings, landmarks, parks,
// streets, communities). If it has nothing or fails, Places Text Search,
// which is more forgiving of partial and descriptive queries.
export const searchLocationsAction = async (input: LocationSearchInput): Promise<LocationSearchResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = locationSearchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'maps.search.empty' };
  const { query, sessionToken, proximity, language } = parsed.data;

  try {
    const suggestions = await googleMapsProvider.suggest(query, sessionToken, language, proximity);
    if (suggestions.length > 0) return { success: true, suggestions };
  } catch (error) {
    logFailure('Places Autocomplete failed, falling back to Text Search', error);
  }

  try {
    return { success: true, suggestions: await googleMapsProvider.searchPlaces(query, language) };
  } catch (error) {
    logFailure('Location search failed', error);
    return { success: false, error: SEARCH_UNAVAILABLE_MESSAGE };
  }
};

export type ResolveLocationResult = { success: true; location: ResolvedLocation } | { success: false; error: string };

export const retrieveLocationAction = async (input: LocationRetrieveInput): Promise<ResolveLocationResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = locationRetrieveSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'maps.search.loadFailed' };

  try {
    const { id, sessionToken, language } = parsed.data;
    return { success: true, location: await googleMapsProvider.retrieve(id, sessionToken, language) };
  } catch (error) {
    logFailure('Place Details failed', error);
    return { success: false, error: 'maps.search.loadFailed' };
  }
};

// Describes a dropped pin or the device's location. A failure here is not
// fatal: the caller keeps the coordinates and asks for address details.
export const reverseGeocodeAction = async (input: ReverseGeocodeInput): Promise<ResolveLocationResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = reverseGeocodeSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'maps.errors.invalidCoordinates' };

  try {
    const { language, ...coordinates } = parsed.data;
    return { success: true, location: await googleMapsProvider.reverseGeocode(coordinates, language) };
  } catch (error) {
    logFailure('Reverse geocoding failed', error);
    return { success: false, error: 'maps.errors.lookupFailed' };
  }
};

export type GetRouteResult = { success: true; route: RouteResult } | { success: false; error: string };

export const getRouteAction = async (input: RouteRequestInput): Promise<GetRouteResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = routeRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'maps.errors.invalidCoordinates' };

  try {
    const route = await googleMapsProvider.getRoute(parsed.data.origin, parsed.data.destination);
    return { success: true, route };
  } catch (error) {
    logFailure('Route calculation failed', error);
    return { success: false, error: BOOKING_ERRORS.routeFailed };
  }
};
