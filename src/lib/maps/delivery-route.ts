import 'server-only';

import { googleMapsProvider } from '@/lib/maps/google-provider';
import { haversineDistanceKm } from '@/lib/maps/haversine';

import type { LocationSource, RouteResult, RouteWaypoint } from '@/lib/maps/types';

// THE delivery distance. The booking wizard's quote (getRouteAction) and
// the booking itself (quoteShipment) both call this, so the customer is
// shown exactly the distance and price the server books. Pricing uses
// RouteResult.distanceKm from here and nothing else: no straight-line
// distance, no address text, and no fallback when Google can't route.

export type DeliveryEndpoint = {
  lat: number;
  lng: number;
  // The Google place the customer selected, when they searched for one.
  placeId?: string | null;
  source?: LocationSource | null;
  // TEMPORARY (route-distance investigation): logged in development only.
  address?: string | null;
};

// A searched place's coordinates are copied from its Place Details, so the
// place and the booking's point coincide. Anything further apart means the
// place ID doesn't belong to this point (an edited request): route the
// coordinates — what gets stored and where the driver goes — instead.
const PLACE_ROUTE_MATCH_KM = 0.05;

const toWaypoint = async ({ lat, lng, placeId, source }: DeliveryEndpoint): Promise<RouteWaypoint> => {
  const coordinates = { lat, lng };
  // A dropped pin's placeId is only the nearest address Google found; the
  // pin itself is the destination.
  if (source !== 'search' || !placeId) return { coordinates };
  try {
    const place = await googleMapsProvider.retrieve(placeId, null, 'en');
    const offsetKm = haversineDistanceKm(place.coordinates, coordinates);
    if (offsetKm <= PLACE_ROUTE_MATCH_KM) return { coordinates, placeId };
    console.warn('Delivery route: the selected place is not at the booking coordinates; routing the coordinates', {
      placeId,
      placeCoordinates: place.coordinates,
      bookingCoordinates: coordinates,
      offsetKm,
    });
  } catch (error) {
    console.error('Delivery route: Place Details failed; routing the coordinates', error instanceof Error ? error.message : error);
  }
  return { coordinates };
};

const describe = ({ coordinates, placeId }: RouteWaypoint) => ({ ...coordinates, routedBy: placeId ? 'placeId' : 'latLng' });

export const getDeliveryRoute = async ({
  origin,
  destination,
}: {
  origin: DeliveryEndpoint;
  destination: DeliveryEndpoint;
}): Promise<RouteResult> => {
  const [from, to] = await Promise.all([toWaypoint(origin), toWaypoint(destination)]);

  let route: RouteResult;
  try {
    route = await googleMapsProvider.getRoute(from, to);
  } catch (error) {
    // Google occasionally can't route to a place's access point; the exact
    // coordinates are still a real driving route. Any other failure throws.
    if (!from.placeId && !to.placeId) throw error;
    console.warn('Delivery route: Google could not route the selected places; routing their exact coordinates instead', error instanceof Error ? error.message : error);
    route = await googleMapsProvider.getRoute({ coordinates: from.coordinates }, { coordinates: to.coordinates });
  }

  if (process.env.NODE_ENV !== 'production') {
    // TEMPORARY (route-distance investigation).
    console.info('[route-debug] Delivery route', {
      pickupAddress: origin.address ?? null,
      deliveryAddress: destination.address ?? null,
      pickup: { ...describe(from), placeId: from.placeId ?? null, requestedPlaceId: origin.placeId ?? null, source: origin.source ?? null },
      dropoff: { ...describe(to), placeId: to.placeId ?? null, requestedPlaceId: destination.placeId ?? null, source: destination.source ?? null },
      distanceMeters: route.distanceMeters,
      distanceKm: route.distanceKm,
      durationSeconds: route.durationSeconds,
    });
  }

  return route;
};
