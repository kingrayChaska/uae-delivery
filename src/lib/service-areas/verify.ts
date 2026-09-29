import 'server-only';

import { mapboxProvider } from '@/lib/maps/mapbox-provider';
import { UNKNOWN_SERVICE_AREA, classifyServiceArea, serviceAreaError } from '@/lib/service-areas/config';

import type { Emirate, ServiceArea } from '@/lib/service-areas/config';
import type { Coordinates } from '@/lib/types';

// The authoritative emirate check. It asks Mapbox which region the booking's
// own coordinates are in, and never trusts the place details the browser
// sent (those can be edited). A failed lookup is treated as "unknown" —
// a location is only ever bookable once it's confirmed.

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;
// Emirate boundaries don't move, and a booking usually repeats its pickup,
// so confirmed answers are reused for an hour (per server instance).
const cache = new Map<string, { area: ServiceArea; expires: number }>();

const cacheKey = ({ lat, lng }: Coordinates) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

export const lookUpServiceArea = async (coordinates: Coordinates): Promise<ServiceArea> => {
  const key = cacheKey(coordinates);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.area;

  let area: ServiceArea;
  try {
    const location = await mapboxProvider.reverseGeocode(coordinates);
    area = classifyServiceArea(location.place);
  } catch (error) {
    console.error('Service-area lookup failed', error instanceof Error ? error.message : error);
    // Not cached: it may only be a passing outage.
    return UNKNOWN_SERVICE_AREA;
  }

  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { area, expires: Date.now() + CACHE_TTL_MS });
  return area;
};

export type TripServiceAreas = { pickup: ServiceArea; dropoff: ServiceArea };

export const lookUpTripServiceAreas = async (pickup: Coordinates, dropoff: Coordinates): Promise<TripServiceAreas> => {
  const [pickupArea, dropoffArea] = await Promise.all([lookUpServiceArea(pickup), lookUpServiceArea(dropoff)]);
  return { pickup: pickupArea, dropoff: dropoffArea };
};

// Throws the customer-readable reason when either end can't be booked
// online; otherwise returns the two confirmed emirates.
export const requireServiceableTrip = async (
  pickup: Coordinates,
  dropoff: Coordinates,
): Promise<{ pickup: Emirate; dropoff: Emirate }> => {
  const areas = await lookUpTripServiceAreas(pickup, dropoff);
  const error = serviceAreaError(areas.pickup, 'pickup') ?? serviceAreaError(areas.dropoff, 'dropoff');
  if (error || !areas.pickup.emirate || !areas.dropoff.emirate) throw new Error(error ?? 'This location can’t be booked.');
  return { pickup: areas.pickup.emirate, dropoff: areas.dropoff.emirate };
};
