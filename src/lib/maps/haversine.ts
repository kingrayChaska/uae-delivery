import type { Coordinates } from '@/lib/types';

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

// Straight-line (haversine) distance in km. This is ONLY for sorting
// available drivers by rough proximity to a pickup point in the dispatch
// UI (spec section 23's "1.2 km from pickup") — never for pricing, which
// always uses the real road-route distance from Mapbox (lib/maps).
export const haversineDistanceKm = (a: Coordinates, b: Coordinates): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_KM * c;
};
