import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Coordinates } from '@/lib/types';

// The whole distance path, end to end, with only the network faked: the
// wizard's trip key → getDeliveryRoute → googleMapsProvider.getRoute →
// the Routes API request and response → calculateShipmentPrice. Whatever
// distanceMeters Google returns is exactly what is priced and limited.

vi.mock('server-only', () => ({}));
// No shared cache: each test controls exactly what Google is asked.
vi.mock('@/lib/maps/shared-cache', () => ({ readSharedCache: async () => null, writeSharedCache: async () => {} }));

process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';

const { getDeliveryRoute } = await import('@/lib/maps/delivery-route');
const { calculateShipmentPrice } = await import('@/lib/pricing/calculate');
const { DEFAULT_PRICING_RULES } = await import('@/lib/pricing/config');
const { tripKey } = await import('@/lib/shipment/trip-key');

const sameDay = DEFAULT_PRICING_RULES.individual.same_day;
const nextDay = DEFAULT_PRICING_RULES.individual.next_day;

type RoutesRequest = {
  origin: { location?: { latLng: { latitude: number; longitude: number } }; placeId?: string };
  destination: { location?: { latLng: { latitude: number; longitude: number } }; placeId?: string };
  travelMode: string;
  routingPreference: string;
  departureTime: string;
};

// Google's answer per trip, keyed by "originLat,originLng|destLat,destLng".
let distances: Record<string, number>;
let requests: RoutesRequest[];

const pointOf = (waypoint: RoutesRequest['origin']) => `${waypoint.location?.latLng.latitude},${waypoint.location?.latLng.longitude}`;
const key = (a: Coordinates, b: Coordinates) => `${a.lat},${a.lng}|${b.lat},${b.lng}`;

beforeEach(() => {
  distances = {};
  requests = [];
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    expect(String(url)).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    const body = JSON.parse(String(init?.body)) as RoutesRequest;
    requests.push(body);
    const meters = distances[`${pointOf(body.origin)}|${pointOf(body.destination)}`];
    return new Response(JSON.stringify({ routes: [{ distanceMeters: meters, duration: '1800s' }] }), { status: 200 });
  });
});

afterEach(() => vi.restoreAllMocks());

// Fresh coordinates per test, so the provider's in-memory cache never
// answers for a previous test.
let seed = 0;
const point = (): Coordinates => ({ lat: 25 + ++seed / 1000, lng: 55.2 + seed / 1000 });

const routeAndPrice = async (pickup: Coordinates, dropoff: Coordinates) => {
  const route = await getDeliveryRoute({ origin: { ...pickup, source: 'pin' }, destination: { ...dropoff, source: 'pin' } });
  return {
    route,
    sameDay: calculateShipmentPrice({ rule: sameDay, distanceKm: route.distanceKm }),
    nextDay: calculateShipmentPrice({ rule: nextDay, distanceKm: route.distanceKm }),
  };
};

describe('route distance → price (Google driving distance, metres → km)', () => {
  it.each([
    ['a short route under 5 km', 3_200, 3.2, 12, 8],
    ['exactly 5 km', 5_000, 5, 12, 8],
    ['a route above 5 km', 14_600, 14.6, 21.6, 15.2],
    ['the ~52 km route', 52_000, 52, 59, 43.25],
  ])('%s: %i m → %s km, Same-Day AED %s, Second-Day AED %s', async (_label, meters, km, sameDayFee, nextDayFee) => {
    const [pickup, dropoff] = [point(), point()];
    distances[key(pickup, dropoff)] = meters;

    const result = await routeAndPrice(pickup, dropoff);

    // One Routes API DRIVE request, with exactly these coordinates, routed
    // with typical traffic at the reference departure (as Google Maps).
    expect(requests).toHaveLength(1);
    expect(requests[0].travelMode).toBe('DRIVE');
    expect(requests[0].routingPreference).toBe('TRAFFIC_AWARE');
    expect(Date.parse(requests[0].departureTime)).toBeGreaterThan(Date.now());
    expect(requests[0].origin.location?.latLng).toEqual({ latitude: pickup.lat, longitude: pickup.lng });
    expect(requests[0].destination.location?.latLng).toEqual({ latitude: dropoff.lat, longitude: dropoff.lng });

    expect(result.route.distanceMeters).toBe(meters);
    expect(result.route.distanceKm).toBe(km);
    expect(result.sameDay.distanceKm).toBe(km);
    expect(result.sameDay.totalPrice).toBe(sameDayFee);
    expect(result.nextDay.totalPrice).toBe(nextDayFee);
  });

  it('applies a 50 km limit to the real 52 km route — and would not to an undercounted 36.44 km one', async () => {
    const limited = { ...sameDay, maxDistanceKm: 50 };
    const [pickup, dropoff] = [point(), point()];
    distances[key(pickup, dropoff)] = 52_000;

    const { route } = await routeAndPrice(pickup, dropoff);

    expect(calculateShipmentPrice({ rule: limited, distanceKm: route.distanceKm }).exceedsDistanceLimit).toBe(true);
    expect(calculateShipmentPrice({ rule: limited, distanceKm: 36.44 }).exceedsDistanceLimit).toBe(false);
    expect(calculateShipmentPrice({ rule: limited, distanceKm: 50 }).exceedsDistanceLimit).toBe(false);
    expect(calculateShipmentPrice({ rule: limited, distanceKm: 50.01 }).exceedsDistanceLimit).toBe(true);
  });

  it('routes again, with the new pickup, after the pickup changes', async () => {
    const [pickup, newPickup, dropoff] = [point(), point(), point()];
    distances[key(pickup, dropoff)] = 36_440;
    distances[key(newPickup, dropoff)] = 52_000;

    expect((await routeAndPrice(pickup, dropoff)).route.distanceKm).toBe(36.44);
    const after = await routeAndPrice(newPickup, dropoff);

    expect(requests).toHaveLength(2);
    expect(requests[1].origin.location?.latLng).toEqual({ latitude: newPickup.lat, longitude: newPickup.lng });
    expect(after.route.distanceKm).toBe(52);
    expect(after.sameDay.totalPrice).toBe(59);
    expect(tripKey(newPickup, dropoff)).not.toBe(tripKey(pickup, dropoff));
  });

  it('routes again, with the new delivery point, after the delivery address changes', async () => {
    const [pickup, dropoff, newDropoff] = [point(), point(), point()];
    distances[key(pickup, dropoff)] = 36_440;
    distances[key(pickup, newDropoff)] = 52_000;

    expect((await routeAndPrice(pickup, dropoff)).route.distanceKm).toBe(36.44);
    const after = await routeAndPrice(pickup, newDropoff);

    expect(requests).toHaveLength(2);
    expect(requests[1].destination.location?.latLng).toEqual({ latitude: newDropoff.lat, longitude: newDropoff.lng });
    expect(after.route.distanceKm).toBe(52);
    expect(after.nextDay.totalPrice).toBe(43.25);
    expect(tripKey(pickup, newDropoff)).not.toBe(tripKey(pickup, dropoff));
  });

  it('prices the booking from the same Google route the wizard quoted', async () => {
    const [pickup, dropoff] = [point(), point()];
    distances[key(pickup, dropoff)] = 42_220;

    // getRouteAction (the wizard's quote), then quoteShipment (the booking).
    const quoted = await routeAndPrice(pickup, dropoff);
    const booked = await routeAndPrice(pickup, dropoff);

    expect(requests).toHaveLength(1);
    expect(booked.route.distanceMeters).toBe(quoted.route.distanceMeters);
    expect(booked.sameDay.totalPrice).toBe(quoted.sameDay.totalPrice);
    expect(booked.sameDay.totalPrice).toBe(49.22);
  });

  it('reuses a route only for the identical trip', async () => {
    const [pickup, dropoff] = [point(), point()];
    distances[key(pickup, dropoff)] = 20_000;

    await routeAndPrice(pickup, dropoff);
    await routeAndPrice(pickup, dropoff);

    expect(requests).toHaveLength(1);
  });
});

describe('the wizard trip key', () => {
  const at = { lat: 25.2, lng: 55.3 };

  it('changes when a different place is selected at the same coordinates', () => {
    const dropoff = { lat: 25.3, lng: 55.4 };
    expect(tripKey({ ...at, place: { placeId: 'a', source: 'search' } }, dropoff)).not.toBe(
      tripKey({ ...at, place: { placeId: 'b', source: 'search' } }, dropoff),
    );
  });

  it('changes when a searched place becomes a pin on the same point', () => {
    const dropoff = { lat: 25.3, lng: 55.4 };
    expect(tripKey({ ...at, place: { placeId: 'a', source: 'search' } }, dropoff)).not.toBe(
      tripKey({ ...at, place: { placeId: 'a', source: 'pin' } }, dropoff),
    );
  });

  it('distinguishes pickup from delivery', () => {
    const other = { lat: 25.3, lng: 55.4 };
    expect(tripKey(at, other)).not.toBe(tripKey(other, at));
  });
});
