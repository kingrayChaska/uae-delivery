import 'server-only';

import { googleMapsProvider } from '@/lib/maps/google-provider';
import { haversineDistanceKm } from '@/lib/maps/haversine';
import { isInsideUae } from '@/lib/shipment/booking-guards';
import {
  OUTSIDE_UAE_SERVICE_AREA,
  UNVERIFIED_SERVICE_AREA,
  classifyServiceArea,
  serviceAreaError,
} from '@/lib/service-areas/config';

import type { Emirate, ServiceArea } from '@/lib/service-areas/config';
import type { Coordinates } from '@/lib/types';

// The authoritative coverage check, run by the server for both ends of
// every booking. It decides from Google's own data, never from the place
// details or address text the browser sent (those can be edited):
//
//   1. Outside the UAE's bounding box → outside the UAE, no lookup needed.
//   2. The Google place the customer selected: its Place ID is looked up
//      again here, and its address components decide the emirate — as long
//      as that place really is where the booking's coordinates are.
//   3. Otherwise (a dropped pin, no Place ID, or a place Google gives no
//      emirate for): reverse geocoding of the exact coordinates.
//
// A lookup that fails is "unverified" (contact support), never "active".

// A selected place and the booking's point must agree: the point is the
// place's own location for a search, or the nearest address for a pin.
const PLACE_MATCH_KM = 2;

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;
// Emirate boundaries don't move, and a booking usually repeats its pickup,
// so confirmed answers are reused for an hour (per server instance).
const cache = new Map<string, { area: ServiceArea; expires: number }>();

const cacheKey = ({ lat, lng }: Coordinates, placeId?: string | null) => `${lat.toFixed(5)},${lng.toFixed(5)}|${placeId ?? ''}`;

const remember = (key: string, area: ServiceArea) => {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { area, expires: Date.now() + CACHE_TTL_MS });
  return area;
};

// The selected place's verdict, or null when it can't decide.
const fromSelectedPlace = async (coordinates: Coordinates, placeId: string): Promise<ServiceArea | null> => {
  try {
    const place = await googleMapsProvider.retrieve(placeId, null, 'en');
    if (haversineDistanceKm(place.coordinates, coordinates) > PLACE_MATCH_KM) {
      console.warn('Coverage check: the selected place is not at the booking coordinates; using the coordinates');
      return null;
    }
    const area = classifyServiceArea(place.place);
    return area.status === 'unverified' ? null : area;
  } catch (error) {
    console.error('Coverage check: Place Details failed', error instanceof Error ? error.message : error);
    return null;
  }
};

export const lookUpServiceArea = async (coordinates: Coordinates, placeId?: string | null): Promise<ServiceArea> => {
  if (!isInsideUae(coordinates)) return OUTSIDE_UAE_SERVICE_AREA;

  const key = cacheKey(coordinates, placeId);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.area;

  if (placeId) {
    const area = await fromSelectedPlace(coordinates, placeId);
    if (area) return remember(key, area);
  }

  try {
    const location = await googleMapsProvider.reverseGeocode(coordinates, 'en');
    return remember(key, classifyServiceArea(location.place));
  } catch (error) {
    console.error('Coverage check: reverse geocoding failed', error instanceof Error ? error.message : error);
    // Not cached: it may only be a passing outage.
    return UNVERIFIED_SERVICE_AREA;
  }
};

export type TripServiceAreas = { pickup: ServiceArea; dropoff: ServiceArea };
export type TripPlaceIds = { pickup?: string | null; dropoff?: string | null };

// Each end is checked on its own, with the same rules.
export const lookUpTripServiceAreas = async (
  pickup: Coordinates,
  dropoff: Coordinates,
  placeIds: TripPlaceIds = {},
): Promise<TripServiceAreas> => {
  const [pickupArea, dropoffArea] = await Promise.all([
    lookUpServiceArea(pickup, placeIds.pickup),
    lookUpServiceArea(dropoff, placeIds.dropoff),
  ]);
  return { pickup: pickupArea, dropoff: dropoffArea };
};

// Throws the customer-readable reason when either end can't be booked
// normally; otherwise returns the two confirmed emirates.
export const requireServiceableTrip = async (
  pickup: Coordinates,
  dropoff: Coordinates,
  placeIds: TripPlaceIds = {},
): Promise<{ pickup: Emirate; dropoff: Emirate }> => {
  const areas = await lookUpTripServiceAreas(pickup, dropoff, placeIds);
  const error = serviceAreaError(areas.pickup, 'pickup') ?? serviceAreaError(areas.dropoff, 'dropoff');
  if (error || !areas.pickup.emirate || !areas.dropoff.emirate) throw new Error(error ?? 'serviceAreas.errors.cantBook');
  return { pickup: areas.pickup.emirate, dropoff: areas.dropoff.emirate };
};
