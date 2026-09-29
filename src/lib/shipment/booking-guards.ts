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
  weightRequired: 'Enter the shipment weight — it’s required for merchant shipments.',
} as const;

// The long-distance restriction: booking is refused beyond the rule's
// maximum distance (50 km by default, set per pricing rule). The same limit
// is enforced by createShipment() and by the database for every caller.
export const distanceLimitMessage = (distanceKm: number, maxDistanceKm: number) =>
  `This delivery is ${distanceKm.toFixed(1)} km by road, which is beyond ParcelLink’s ${maxDistanceKm} km standard delivery distance, so it can’t be booked online. Choose a delivery address within ${maxDistanceKm} km of the pickup, or contact support to arrange a long-distance delivery.`;

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
