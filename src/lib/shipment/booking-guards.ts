import { haversineDistanceKm } from '@/lib/maps/haversine';
import { UAE_BBOX } from '@/lib/maps/config';

import type { Coordinates } from '@/lib/types';

// Shared by the booking wizard (instant feedback) and createShipment (the
// real check — a direct call to the server action skips the wizard).

export const MIN_TRIP_KM = 0.1;

export const BOOKING_ERRORS = {
  sameLocation: 'Pickup and delivery are the same place. Choose a different delivery address.',
  outsideUae: 'We only deliver within the UAE. Choose addresses inside the UAE.',
  routeFailed: 'Unable to calculate route. Please try again.',
} as const;

export const isInsideUae = ({ lat, lng }: Coordinates) => {
  const [minLng, minLat, maxLng, maxLat] = UAE_BBOX;
  return Number.isFinite(lat) && Number.isFinite(lng) && lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
};

// Returns an error message, or null when the two points are bookable.
export const validateBookingLocations = (pickup: Coordinates, dropoff: Coordinates): string | null => {
  if (!isInsideUae(pickup) || !isInsideUae(dropoff)) return BOOKING_ERRORS.outsideUae;
  if (haversineDistanceKm(pickup, dropoff) < MIN_TRIP_KM) return BOOKING_ERRORS.sameLocation;
  return null;
};

// A routing service can return a technically valid but useless route
// (zero or non-finite distance). Refuse to price it rather than charge the
// base fare for "nothing".
export const validateRoute = (route: { distanceKm: number; durationMinutes: number }): string | null => {
  if (!Number.isFinite(route.distanceKm) || !Number.isFinite(route.durationMinutes)) return BOOKING_ERRORS.routeFailed;
  if (route.distanceKm < MIN_TRIP_KM) return BOOKING_ERRORS.sameLocation;
  return null;
};
