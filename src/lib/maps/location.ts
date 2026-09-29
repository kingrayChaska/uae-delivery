import { isInsideUae } from '@/lib/shipment/booking-guards';

import type { LocationSource, ResolvedLocation } from '@/lib/maps/types';
import type { LocationPlaceInput } from '@/lib/shipment/schemas';
import type { Coordinates } from '@/lib/types';

// What the location picker hands to the booking form for one end of a trip.
// lat/lng are the delivery point; address and place describe it.
export type LocationValue = {
  address: string;
  lat: number;
  lng: number;
  place: LocationPlaceInput;
};

const EMPTY_PLACE = {
  name: null,
  street: null,
  neighborhood: null,
  district: null,
  city: null,
  region: null,
  regionCode: null,
  postcode: null,
  country: null,
};

// Used when a pin can't be described by Mapbox: the coordinates are kept and
// the customer adds building/unit details by hand.
export const pinnedAddress = ({ lat, lng }: Coordinates) => `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

export const toLocationValue = (
  coordinates: Coordinates,
  source: LocationSource,
  resolved: ResolvedLocation | null,
): LocationValue => ({
  address: resolved?.formattedAddress ?? pinnedAddress(coordinates),
  lat: coordinates.lat,
  lng: coordinates.lng,
  place: { source, ...(resolved?.place ?? EMPTY_PLACE) },
});

// "Marina Gate" / "King Salman St, Marsa Dubai, Dubai, UAE" for display.
// A dropped pin with no address is stored as "Pinned location (lat, lng)";
// pinnedCoordinates is then set so the UI can label it in the reader's
// language (lib/maps/use-address-parts.ts).
export const splitAddress = (address: string) => {
  // The no-address fallback isn't comma-separated place names.
  const pinned = address.match(/^Pinned location \((.+)\)$/);
  if (pinned) return { title: 'Pinned location', subtitle: `Coordinates ${pinned[1]}`, pinnedCoordinates: pinned[1] };
  const [first, ...rest] = address.split(',').map((part) => part.trim());
  return { title: first ?? address, subtitle: rest.join(', '), pinnedCoordinates: null };
};

export { isInsideUae };
