'use server';

import { requireUser } from '@/lib/auth/guards';
import { RATE_LIMIT_MESSAGE, checkRateLimit } from '@/lib/security/rate-limit';
import { mapboxProvider, MapsProviderError } from '@/lib/maps/mapbox-provider';
import { addressSearchSchema, routeRequestSchema } from '@/lib/maps/schemas';
import { BOOKING_ERRORS } from '@/lib/shipment/booking-guards';

import type { AddressSearchInput, RouteRequestInput } from '@/lib/maps/schemas';
import type { GeocodeResult, RouteResult } from '@/lib/maps/types';

export type AddressSearchResult =
  | { success: true; results: GeocodeResult[] }
  | { success: false; error: string };

// Both maps actions call paid Mapbox APIs, so they require a signed-in user
// and are rate limited per user — otherwise anyone could run up the bill.
export const searchAddressAction = async (input: AddressSearchInput): Promise<AddressSearchResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = addressSearchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid search query' };

  try {
    const results = await mapboxProvider.autocomplete(parsed.data.query);
    return { success: true, results };
  } catch (error) {
    // Config and network details stay in server logs.
    if (error instanceof MapsProviderError) console.error('Address search failed', error.message);
    return { success: false, error: 'Address search is unavailable right now. Please try again.' };
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
