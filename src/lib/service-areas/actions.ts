'use server';

import { requireUser } from '@/lib/auth/guards';
import { RATE_LIMIT_MESSAGE, checkRateLimit } from '@/lib/security/rate-limit';
import { routeRequestSchema } from '@/lib/maps/schemas';
import { lookUpTripServiceAreas } from '@/lib/service-areas/verify';

import type { RouteRequestInput } from '@/lib/maps/schemas';
import type { TripServiceAreas } from '@/lib/service-areas/verify';

export type CheckServiceAreasResult = { success: true; areas: TripServiceAreas } | { success: false; error: string };

// The booking wizard asks this before showing prices, so the customer sees
// the same answer the booking itself will get (quoteShipment re-checks it).
// Paid Mapbox lookups: signed-in users only, rate limited like the other
// maps actions.
export const checkServiceAreasAction = async (input: RouteRequestInput): Promise<CheckServiceAreasResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = routeRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid coordinates' };

  return { success: true, areas: await lookUpTripServiceAreas(parsed.data.origin, parsed.data.destination) };
};
