import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MapsLanguage, PlaceDetails, ResolvedLocation } from '@/lib/maps/types';
import type { Coordinates } from '@/lib/types';

vi.mock('server-only', () => ({}));

const reverseGeocode = vi.fn<(coordinates: Coordinates, language?: MapsLanguage) => Promise<ResolvedLocation>>();
const retrieve = vi.fn<(id: string, sessionToken: string | null, language: MapsLanguage) => Promise<ResolvedLocation>>();
vi.mock('@/lib/maps/google-provider', () => ({ googleMapsProvider: { reverseGeocode, retrieve } }));

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

const describe_ = (parts: Partial<PlaceDetails>) => (coordinates: Coordinates): ResolvedLocation => ({
  coordinates,
  formattedAddress: 'Somewhere, UAE',
  place: {
    placeId: null,
    name: null,
    street: null,
    neighborhood: null,
    district: null,
    city: null,
    region: null,
    regionCode: null,
    postcode: null,
    country: 'United Arab Emirates',
    countryCode: 'AE',
    ...parts,
  },
});
const inEmirate = (region: string) => describe_({ region });

// Distinct coordinates per test — confirmed answers are cached.
let n = 0;
const point = () => ({ lat: 25 + ++n / 1000, lng: 55.3 });

beforeEach(() => {
  reverseGeocode.mockReset();
  retrieve.mockReset();
});

describe('requireServiceableTrip (the server-side check every booking passes)', () => {
  it('accepts Dubai → Sharjah and returns the confirmed emirates', async () => {
    reverseGeocode.mockImplementationOnce(async (c) => inEmirate('Dubai')(c));
    reverseGeocode.mockImplementationOnce(async (c) => inEmirate('Sharjah')(c));
    await expect(requireServiceableTrip(point(), point())).resolves.toEqual({ pickup: 'Dubai', dropoff: 'Sharjah' });
  });

  it('asks Google in English, whatever language the customer used', async () => {
    reverseGeocode.mockImplementation(async (c) => inEmirate('Ajman')(c));
    await requireServiceableTrip(point(), point());
    expect(reverseGeocode.mock.calls.every(([, language]) => language === 'en')).toBe(true);
  });

  it('refuses Dubai → Abu Dhabi with Contact Support, naming the emirate', async () => {
    reverseGeocode.mockImplementationOnce(async (c) => inEmirate('Dubai')(c));
    reverseGeocode.mockImplementationOnce(async (c) => inEmirate('Abu Dhabi')(c));
    expect(await refusal(requireServiceableTrip(point(), point()))).toMatch(
      /^Delivery location: Abu Dhabi is outside our standard same-day delivery coverage/,
    );
  });

  it('refuses a pickup in another emirate, as a pickup', async () => {
    reverseGeocode.mockImplementationOnce(async (c) => inEmirate('Ras Al Khaimah')(c));
    reverseGeocode.mockImplementationOnce(async (c) => inEmirate('Ajman')(c));
    expect(await refusal(requireServiceableTrip(point(), point()))).toMatch(/^Pickup location: Ras Al Khaimah/);
  });

  it('refuses a UAE location whose emirate can\'t be confirmed, asking for support', async () => {
    reverseGeocode.mockImplementation(async (c) => describe_({})(c));
    expect(await refusal(requireServiceableTrip(point(), point()))).toMatch(/We couldn’t verify delivery availability/);
  });

  it('fails closed (unverified) when the lookup itself fails', async () => {
    reverseGeocode.mockImplementation(async () => {
      throw new Error('network down');
    });
    expect(await refusal(requireServiceableTrip(point(), point()))).toMatch(/We couldn’t verify delivery availability/);
  });

  it('refuses a point outside the UAE without asking Google', async () => {
    expect(await refusal(requireServiceableTrip({ lat: 21.5, lng: 39.2 }, point()))).toMatch(/^Pickup location: This location is outside the UAE/);
    expect(reverseGeocode).toHaveBeenCalledTimes(1); // only the other end
  });
});

describe('the selected Google place decides', () => {
  it('looks the selected place up again by its ID and uses its emirate', async () => {
    const p = point();
    retrieve.mockImplementation(async () => describe_({ city: 'Dubai' })(p));
    await expect(lookUpServiceArea(p, 'ChIJ-downtown')).resolves.toEqual({ status: 'active', emirate: 'Dubai' });
    expect(retrieve).toHaveBeenCalledWith('ChIJ-downtown', null, 'en');
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it('ignores a place ID that points somewhere else (it only trusts the booking\'s coordinates)', async () => {
    const p = point();
    // A Dubai place, sent with coordinates in Abu Dhabi.
    retrieve.mockImplementation(async () => describe_({ region: 'Dubai' })({ lat: 25.2, lng: 55.27 }));
    reverseGeocode.mockImplementation(async (c) => inEmirate('Abu Dhabi')(c));
    const abuDhabi = { lat: 24.45 + ++n / 1000, lng: 54.38 };
    await expect(lookUpServiceArea(abuDhabi, 'ChIJ-elsewhere')).resolves.toEqual({ status: 'contact_support', emirate: 'Abu Dhabi' });
    expect(p).toBeDefined();
  });

  it('falls back to the coordinates when the place has no emirate, or can\'t be loaded', async () => {
    const a = point();
    retrieve.mockImplementationOnce(async () => describe_({})(a));
    reverseGeocode.mockImplementation(async (c) => inEmirate('Sharjah')(c));
    await expect(lookUpServiceArea(a, 'ChIJ-vague')).resolves.toEqual({ status: 'active', emirate: 'Sharjah' });

    const b = point();
    retrieve.mockImplementationOnce(async () => {
      throw new Error('NOT_FOUND');
    });
    await expect(lookUpServiceArea(b, 'ChIJ-gone')).resolves.toEqual({ status: 'active', emirate: 'Sharjah' });
  });

  it('checks pickup and delivery independently, each from its own place', async () => {
    const pickup = point();
    const dropoff = point();
    retrieve.mockImplementation(async (id) => (id === 'ChIJ-ajman' ? describe_({ region: 'Ajman' })(pickup) : describe_({ region: 'Fujairah' })(dropoff)));
    expect(await refusal(requireServiceableTrip(pickup, dropoff, { pickup: 'ChIJ-ajman', dropoff: 'ChIJ-fujairah' }))).toMatch(
      /^Delivery location: Fujairah/,
    );
  });
});

describe('lookUpServiceArea caching', () => {
  it('reuses a confirmed answer for the same point', async () => {
    reverseGeocode.mockImplementation(async (c) => inEmirate('Dubai')(c));
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
    expect((await lookUpServiceArea(p)).status).toBe('unverified');
    reverseGeocode.mockImplementationOnce(async (c) => inEmirate('Dubai')(c));
    expect((await lookUpServiceArea(p)).status).toBe('active');
  });
});
