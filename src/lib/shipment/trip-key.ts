// Identifies a trip by everything its route depends on, so the booking
// wizard never shows (or prices) a route calculated for different ends.
// A searched place is routed by its Place ID (lib/maps/delivery-route.ts),
// so choosing a different place at the same coordinates is a different
// trip and is routed again.
export type TripEnd = {
  lat: number;
  lng: number;
  place?: { placeId?: string | null; source?: string | null } | null;
};

const endKey = (end: TripEnd) => `${end.lat},${end.lng},${end.place?.placeId ?? ''},${end.place?.source ?? ''}`;

export const tripKey = (pickup: TripEnd, dropoff: TripEnd) => `${endKey(pickup)}|${endKey(dropoff)}`;
