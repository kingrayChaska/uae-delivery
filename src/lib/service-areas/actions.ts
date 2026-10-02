'use server';

import { requireUser } from '@/lib/auth/guards';
import { RATE_LIMIT_MESSAGE, checkRateLimit } from '@/lib/security/rate-limit';
import { z } from '@/lib/zod';
import { lookUpServiceArea, lookUpTripServiceAreas } from '@/lib/service-areas/verify';

import type { ServiceArea } from '@/lib/service-areas/config';
import type { TripServiceAreas } from '@/lib/service-areas/verify';

// Paid Google lookups: signed-in users only, rate limited like the other
// maps actions. Both use the same check the booking itself gets
// (quoteShipment → requireServiceableTrip), so the customer never sees a
// different answer at checkout.

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  // The Google place the customer selected, when there is one.
  placeId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,512}$/)
    .nullish(),
});

const tripSchema = z.object({ pickup: pointSchema, dropoff: pointSchema });

export type CoveragePoint = z.infer<typeof pointSchema>;

export type CheckServiceAreasResult = { success: true; areas: TripServiceAreas } | { success: false; error: string };

// Both ends of a trip, before prices are shown.
export const checkServiceAreasAction = async (input: { pickup: CoveragePoint; dropoff: CoveragePoint }): Promise<CheckServiceAreasResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'maps.errors.invalidCoordinates' };

  const { pickup, dropoff } = parsed.data;
  return {
    success: true,
    areas: await lookUpTripServiceAreas(pickup, dropoff, { pickup: pickup.placeId, dropoff: dropoff.placeId }),
  };
};

export type CheckLocationCoverageResult = { success: true; area: ServiceArea } | { success: false; error: string };

// One location, as soon as it's chosen — used when the place details the
// browser has can't confirm the emirate (a pin whose address lookup
// failed, a place Google described without one), so the server decides
// instead of the location being wrongly turned away.
export const checkLocationCoverageAction = async (input: CoveragePoint): Promise<CheckLocationCoverageResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('mapsPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = pointSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'maps.errors.invalidCoordinates' };

  const { placeId, ...coordinates } = parsed.data;
  return { success: true, area: await lookUpServiceArea(coordinates, placeId) };
};
