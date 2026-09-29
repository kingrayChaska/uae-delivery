import { describe, expect, it } from 'vitest';

import {
  EMIRATES,
  SERVICE_AREAS,
  SUPPORTED_EMIRATES_TEXT,
  classifyServiceArea,
  identifyEmirate,
  serviceAreaError,
  serviceAreaNotice,
  serviceAreaRequest,
} from '@/lib/service-areas/config';
import { parseRetrieveResponse, parseReverseGeocodeResponse } from '@/lib/maps/mapbox-client';

describe('SERVICE_AREAS', () => {
  it('covers every emirate exactly once', () => {
    const listed = [...SERVICE_AREAS.fullySupported, ...SERVICE_AREAS.requestOnly];
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.toSorted()).toEqual(EMIRATES.map((emirate) => emirate.name).toSorted());
  });

  it('fully supports only Dubai, Sharjah and Ajman', () => {
    expect(SERVICE_AREAS.fullySupported).toEqual(['Dubai', 'Sharjah', 'Ajman']);
    expect(SUPPORTED_EMIRATES_TEXT).toBe('Dubai, Sharjah and Ajman');
  });
});

describe('identifyEmirate', () => {
  it('uses the ISO region code first, with or without the country prefix', () => {
    expect(identifyEmirate({ regionCode: 'AE-DU', region: 'Dubai' })).toBe('Dubai');
    expect(identifyEmirate({ regionCode: 'SH' })).toBe('Sharjah');
    expect(identifyEmirate({ regionCode: 'ae-aj' })).toBe('Ajman');
    expect(identifyEmirate({ regionCode: 'AE-AZ' })).toBe('Abu Dhabi');
    expect(identifyEmirate({ regionCode: 'AE-RK' })).toBe('Ras Al Khaimah');
    expect(identifyEmirate({ regionCode: 'AE-FU' })).toBe('Fujairah');
    expect(identifyEmirate({ regionCode: 'AE-UQ' })).toBe('Umm Al Quwain');
  });

  it('falls back to the region name, in the spellings Mapbox uses', () => {
    expect(identifyEmirate({ region: 'Dubai' })).toBe('Dubai');
    expect(identifyEmirate({ region: 'Ras al-Khaimah' })).toBe('Ras Al Khaimah');
    expect(identifyEmirate({ region: 'Umm al-Qaiwain' })).toBe('Umm Al Quwain');
    expect(identifyEmirate({ region: 'Emirate of Abu Dhabi' })).toBe('Abu Dhabi');
    expect(identifyEmirate({ region: 'Al Fujairah' })).toBe('Fujairah');
    expect(identifyEmirate({ region: 'Ash Shāriqah' })).toBe('Sharjah');
  });

  it('never guesses: no region, an unknown region or another country is unknown', () => {
    expect(identifyEmirate(null)).toBeNull();
    expect(identifyEmirate({})).toBeNull();
    expect(identifyEmirate({ region: 'Dubai Marina' })).toBeNull();
    expect(identifyEmirate({ region: 'Musandam' })).toBeNull();
    expect(identifyEmirate({ regionCode: 'OM-MU', region: 'Musandam' })).toBeNull();
    // Named like an emirate, but reported as outside the UAE.
    expect(identifyEmirate({ region: 'Dubai', country: 'Oman' })).toBeNull();
    expect(identifyEmirate({ regionCode: 'OM-DU', region: 'Dubai' })).toBeNull();
  });
});

describe('classifyServiceArea', () => {
  it.each(['Dubai', 'Sharjah', 'Ajman'])('%s is fully supported', (region) => {
    expect(classifyServiceArea({ region })).toEqual({ status: 'supported', emirate: region });
  });

  it.each(['Abu Dhabi', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'])('%s is request-only', (region) => {
    expect(classifyServiceArea({ region })).toEqual({ status: 'request_only', emirate: region });
  });

  it('anything unconfirmed is unknown, never supported', () => {
    expect(classifyServiceArea(undefined)).toEqual({ status: 'unknown', emirate: null });
    expect(classifyServiceArea({ region: null, regionCode: null })).toEqual({ status: 'unknown', emirate: null });
  });
});

describe('customer messages', () => {
  it('names the actual emirate for request-only deliveries', () => {
    const notice = serviceAreaNotice({ status: 'request_only', emirate: 'Fujairah' }, 'dropoff');
    expect(notice?.title).toBe('Delivery available on request');
    expect(notice?.body).toEqual([
      'ParcelLink currently provides standard delivery services in Dubai, Sharjah and Ajman.',
      'Deliveries to Fujairah are available on request. Please contact ParcelLink to arrange this delivery.',
    ]);
  });

  it('words a request-only pickup as a pickup', () => {
    const notice = serviceAreaNotice({ status: 'request_only', emirate: 'Abu Dhabi' }, 'pickup');
    expect(notice?.title).toBe('Pickup available on request');
    expect(notice?.body[1]).toContain('Pickups from Abu Dhabi are available on request.');
  });

  it('explains an unconfirmed location', () => {
    const notice = serviceAreaNotice({ status: 'unknown', emirate: null }, 'dropoff');
    expect(notice?.title).toBe('Service area unavailable');
    expect(notice?.body.join(' ')).toContain('couldn’t confirm that this location is within ParcelLink’s current service area');
  });

  it('has nothing to say about supported locations', () => {
    expect(serviceAreaNotice({ status: 'supported', emirate: 'Ajman' }, 'pickup')).toBeNull();
    expect(serviceAreaError({ status: 'supported', emirate: 'Ajman' }, 'pickup')).toBeNull();
  });

  it('gives the server a single sentence-run that says which end is the problem', () => {
    expect(serviceAreaError({ status: 'request_only', emirate: 'Umm Al Quwain' }, 'dropoff')).toMatch(
      /^Delivery location: Delivery available on request\. .*Deliveries to Umm Al Quwain are available on request/,
    );
  });

  it('pre-fills a support request with the emirate and the addresses', () => {
    const request = serviceAreaRequest(
      { status: 'request_only', emirate: 'Ras Al Khaimah' },
      { pickup: 'Dubai Marina Mall, Dubai, UAE', dropoff: 'Al Hamra Village, Ras Al Khaimah, UAE' },
    );
    expect(request.subject).toBe('Delivery request: Ras Al Khaimah');
    expect(request.message).toContain('From: Dubai Marina Mall, Dubai, UAE');
    expect(request.message).toContain('To: Al Hamra Village, Ras Al Khaimah, UAE');
  });
});

describe('Mapbox responses carry the emirate', () => {
  it('reads the region code from reverse geocoding (dropped pins, current location)', () => {
    const { place } = parseReverseGeocodeResponse(
      {
        features: [
          {
            geometry: { type: 'Point', coordinates: [55.44, 25.4] },
            properties: {
              name: 'Al Nuaimiya',
              feature_type: 'neighborhood',
              context: {
                region: { name: 'Ajman', region_code: 'AJ', region_code_full: 'AE-AJ' },
                country: { name: 'United Arab Emirates' },
              },
            },
          },
        ],
      },
      { lat: 25.4, lng: 55.44 },
    );
    expect(place.regionCode).toBe('AE-AJ');
    expect(classifyServiceArea(place)).toEqual({ status: 'supported', emirate: 'Ajman' });
  });

  it('reads the region code from a Search Box place', () => {
    const { place } = parseRetrieveResponse({
      features: [
        {
          geometry: { type: 'Point', coordinates: [54.37, 24.48] },
          properties: {
            name: 'Abu Dhabi Mall',
            feature_type: 'poi',
            context: {
              place: { name: 'Abu Dhabi' },
              region: { name: 'Abu Dhabi', region_code: 'AZ' },
              country: { name: 'United Arab Emirates' },
            },
          },
        },
      ],
    });
    expect(place.regionCode).toBe('AZ');
    expect(classifyServiceArea(place)).toEqual({ status: 'request_only', emirate: 'Abu Dhabi' });
  });
});
