import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MapsLanguage, ResolvedLocation, RouteResult, RouteWaypoint } from '@/lib/maps/types';
import type { Coordinates } from '@/lib/types';

vi.mock('server-only', () => ({}));

const retrieve = vi.fn<(id: string, sessionToken: string | null, language: MapsLanguage) => Promise<ResolvedLocation>>();
const getRoute = vi.fn<(origin: RouteWaypoint, destination: RouteWaypoint) => Promise<RouteResult>>();
vi.mock('@/lib/maps/google-provider', () => ({ googleMapsProvider: { retrieve, getRoute } }));

const { getDeliveryRoute } = await import('@/lib/maps/delivery-route');
const { calculateShipmentPrice } = await import('@/lib/pricing/calculate');
const { DEFAULT_PRICING_RULES } = await import('@/lib/pricing/config');

const DUBAI_MALL = { lat: 25.198765, lng: 55.2796053 };
const AL_NAHDA_TOWER = { lat: 25.2921234, lng: 55.3712345 };

const placeAt = (coordinates: Coordinates): ResolvedLocation => ({
  coordinates,
  formattedAddress: 'Somewhere, UAE',
  place: {
    placeId: 'x',
    name: null,
    street: null,
    neighborhood: null,
    district: null,
    city: null,
    region: null,
    regionCode: null,
    postcode: null,
    country: 'United Arab Emirates',
  },
});

const route = (distanceMeters: number): RouteResult => ({
  distanceMeters,
  distanceKm: distanceMeters / 1000,
  durationSeconds: 1500,
  durationMinutes: 25,
  path: [],
});

beforeEach(() => {
  retrieve.mockReset();
  getRoute.mockReset();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getDeliveryRoute', () => {
  it('routes selected places by Place ID (building -> building), with full-precision coordinates kept', async () => {
    retrieve.mockImplementation(async (id) => placeAt(id === 'dubai-mall' ? DUBAI_MALL : AL_NAHDA_TOWER));
    getRoute.mockResolvedValue(route(24_310));

    const result = await getDeliveryRoute({
      origin: { ...DUBAI_MALL, placeId: 'dubai-mall', source: 'search' },
      destination: { ...AL_NAHDA_TOWER, placeId: 'al-nahda-tower', source: 'search' },
    });

    expect(getRoute).toHaveBeenCalledWith(
      { coordinates: DUBAI_MALL, placeId: 'dubai-mall' },
      { coordinates: AL_NAHDA_TOWER, placeId: 'al-nahda-tower' },
    );
    expect(result.distanceKm).toBe(24.31);
  });

  it('routes dropped pins and current locations by their exact coordinates, not the nearest address', async () => {
    getRoute.mockResolvedValue(route(8_000));
    await getDeliveryRoute({
      origin: { ...DUBAI_MALL, placeId: 'nearest-address', source: 'pin' },
      destination: { ...AL_NAHDA_TOWER, placeId: null, source: 'current_location' },
    });
    expect(retrieve).not.toHaveBeenCalled();
    expect(getRoute).toHaveBeenCalledWith({ coordinates: DUBAI_MALL }, { coordinates: AL_NAHDA_TOWER });
  });

  it('ignores a Place ID that is not at the booking coordinates (an edited request)', async () => {
    retrieve.mockResolvedValue(placeAt({ lat: 25.4, lng: 55.5 })); // somewhere in Ajman
    getRoute.mockResolvedValue(route(10_000));
    await getDeliveryRoute({
      origin: { ...DUBAI_MALL, placeId: 'far-away', source: 'search' },
      destination: { ...AL_NAHDA_TOWER },
    });
    expect(getRoute).toHaveBeenCalledWith({ coordinates: DUBAI_MALL }, { coordinates: AL_NAHDA_TOWER });
  });

  it('routes the coordinates when Place Details fails', async () => {
    retrieve.mockRejectedValue(new Error('Google Maps Platform returned 503'));
    getRoute.mockResolvedValue(route(10_000));
    await getDeliveryRoute({
      origin: { ...DUBAI_MALL, placeId: 'dubai-mall', source: 'search' },
      destination: { ...AL_NAHDA_TOWER },
    });
    expect(getRoute).toHaveBeenCalledWith({ coordinates: DUBAI_MALL }, { coordinates: AL_NAHDA_TOWER });
  });

  it('retries with the exact coordinates when Google cannot route to a place', async () => {
    retrieve.mockResolvedValue(placeAt(DUBAI_MALL));
    getRoute.mockRejectedValueOnce(new Error('no route')).mockResolvedValueOnce(route(12_700));
    const result = await getDeliveryRoute({
      origin: { ...DUBAI_MALL, placeId: 'dubai-mall', source: 'search' },
      destination: { ...AL_NAHDA_TOWER },
    });
    expect(getRoute).toHaveBeenLastCalledWith({ coordinates: DUBAI_MALL }, { coordinates: AL_NAHDA_TOWER });
    expect(result.distanceKm).toBe(12.7);
  });

  it('fails — never falls back to straight-line distance — when Google has no route', async () => {
    getRoute.mockRejectedValue(new Error('Unable to calculate a route between these locations'));
    await expect(getDeliveryRoute({ origin: DUBAI_MALL, destination: AL_NAHDA_TOWER })).rejects.toThrow();
    expect(getRoute).toHaveBeenCalledTimes(1);
  });

  it('feeds the driving distance, not the straight line, into the price', async () => {
    // ~10.9 km as the crow flies; 24.31 km by road.
    getRoute.mockResolvedValue(route(24_310));
    const result = await getDeliveryRoute({ origin: DUBAI_MALL, destination: AL_NAHDA_TOWER });
    const price = calculateShipmentPrice({ rule: DEFAULT_PRICING_RULES.individual.same_day, distanceKm: result.distanceKm });
    expect(price.distanceKm).toBe(24.31);
    expect(price.totalPrice).toBe(31.31);
  });
});
