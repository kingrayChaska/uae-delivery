import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedLocation } from '@/lib/maps/types';
import type { Coordinates } from '@/lib/types';

vi.mock('server-only', () => ({}));

const reverseGeocode = vi.fn<(coordinates: Coordinates) => Promise<ResolvedLocation>>();
vi.mock('@/lib/maps/mapbox-provider', () => ({ mapboxProvider: { reverseGeocode } }));

const { lookUpServiceArea, requireServiceableTrip } = await import('@/lib/service-areas/verify');
const { renderMessage } = await import('@/i18n/test-utils');

// The refusal as an English reader sees it (errors travel as translation keys).
const en = renderMessage('en');
const refusal = async (trip: Promise<unknown>) => {
  try {
    await trip;
  } catch (error) {
    return en((error as Error).message);
  }
  throw new Error('expected the trip to be refused');
};

const at = (regionCode: string | null, region: string | null) => (coordinates: Coordinates): ResolvedLocation => ({
  coordinates,
  formattedAddress: 'Somewhere, UAE',
  place: {
    name: null,
    street: null,
    neighborhood: null,
    district: null,
    city: null,
    region,
    regionCode,
    postcode: null,
    country: 'United Arab Emirates',
  },
});

// Distinct coordinates per test — confirmed answers are cached.
let n = 0;
const point = () => ({ lat: 25 + ++n / 1000, lng: 55.3 });

beforeEach(() => {
  reverseGeocode.mockReset();
});

describe('requireServiceableTrip (the server-side check every booking passes)', () => {
  it('accepts Dubai → Sharjah and returns the confirmed emirates', async () => {
    reverseGeocode.mockImplementationOnce(async (c) => at('AE-DU', 'Dubai')(c));
    reverseGeocode.mockImplementationOnce(async (c) => at('AE-SH', 'Sharjah')(c));
    await expect(requireServiceableTrip(point(), point())).resolves.toEqual({ pickup: 'Dubai', dropoff: 'Sharjah' });
  });

  it('refuses a request-only delivery, naming the emirate', async () => {
    reverseGeocode.mockImplementationOnce(async (c) => at('AE-DU', 'Dubai')(c));
    reverseGeocode.mockImplementationOnce(async (c) => at('AE-AZ', 'Abu Dhabi')(c));
    expect(await refusal(requireServiceableTrip(point(), point()))).toMatch(/Deliveries to Abu Dhabi are available on request/);
  });

  it('refuses a request-only pickup', async () => {
    reverseGeocode.mockImplementationOnce(async (c) => at('AE-RK', 'Ras Al Khaimah')(c));
    reverseGeocode.mockImplementationOnce(async (c) => at('AE-AJ', 'Ajman')(c));
    expect(await refusal(requireServiceableTrip(point(), point()))).toMatch(/Pickups from Ras Al Khaimah/);
  });

  it('refuses a location with no confirmed emirate', async () => {
    reverseGeocode.mockImplementation(async (c) => at(null, null)(c));
    expect(await refusal(requireServiceableTrip(point(), point()))).toMatch(/Service area unavailable/);
  });

  it('fails closed when the lookup itself fails', async () => {
    reverseGeocode.mockImplementation(async () => {
      throw new Error('network down');
    });
    expect(await refusal(requireServiceableTrip(point(), point()))).toMatch(/Service area unavailable/);
  });

  it('ignores whatever place details the browser sent — it only looks at the coordinates', async () => {
    // Nothing but coordinates goes in; the verdict comes from Mapbox.
    reverseGeocode.mockImplementation(async (c) => at('AE-FU', 'Fujairah')(c));
    expect(await refusal(requireServiceableTrip(point(), point()))).toMatch(/Fujairah/);
  });
});

describe('lookUpServiceArea caching', () => {
  it('reuses a confirmed answer for the same point', async () => {
    reverseGeocode.mockImplementation(async (c) => at('AE-DU', 'Dubai')(c));
    const p = point();
    await lookUpServiceArea(p);
    await lookUpServiceArea(p);
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed lookup', async () => {
    const p = point();
    reverseGeocode.mockImplementationOnce(async () => {
      throw new Error('timeout');
    });
    expect((await lookUpServiceArea(p)).status).toBe('unknown');
    reverseGeocode.mockImplementationOnce(async (c) => at('AE-DU', 'Dubai')(c));
    expect((await lookUpServiceArea(p)).status).toBe('supported');
  });
});
