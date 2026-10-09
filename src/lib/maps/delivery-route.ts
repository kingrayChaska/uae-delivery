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

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const getDeliveryRoute = async ({
  origin,
  destination,
}: {
  origin: DeliveryEndpoint;
  destination: DeliveryEndpoint;
}): Promise<RouteResult> => {
  const [from, to] = await Promise.all([toWaypoint(origin), toWaypoint(destination)]);

  try {
    return await googleMapsProvider.getRoute(from, to);
  } catch (error) {
    // Google occasionally can't route to a place's access point; the exact
    // coordinates are still a real driving route. Any other failure throws.
    if (!from.placeId && !to.placeId) {
      console.error('maps:route_failed', { reason: reason(error), originPlaceId: null, destinationPlaceId: null });
      throw error;
    }
    console.warn('maps:route_place_retry', {
      reason: reason(error),
      originPlaceId: from.placeId ?? null,
      destinationPlaceId: to.placeId ?? null,
    });
    try {
      return await googleMapsProvider.getRoute({ coordinates: from.coordinates }, { coordinates: to.coordinates });
    } catch (retryError) {
      console.error('maps:route_failed', {
        reason: reason(retryError),
        originPlaceId: from.placeId ?? null,
        destinationPlaceId: to.placeId ?? null,
      });
      throw retryError;
    }
  }
};
