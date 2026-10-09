import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MapsProviderError,
  buildAutocompleteRequest,
  buildForwardGeocodeRequest,
  buildPlaceDetailsRequest,
  buildReverseGeocodeRequest,
  buildRouteRequest,
  buildTextSearchRequest,
  cleanPlaceText,
  decodePolyline,
  featureTypeOf,
  parseAutocompleteResponse,
  parseForwardGeocodeResponse,
  parsePlaceDetailsResponse,
  parseReverseGeocodeResponse,
  parseRouteResponse,
  parseTextSearchResponse,
  referenceDepartureTime,
} from '@/lib/maps/google-client';
import { splitAddress } from '@/lib/maps/location';

const KEY = 'test-key';
const SESSION = '4f9c3a8e-2b1d-4c6e-9a7f-1e2d3c4b5a69';
const body = (request: { body?: string }) => JSON.parse(request.body ?? '{}');

const uae = { longText: 'United Arab Emirates', shortText: 'AE', types: ['country', 'political'] };
const dubai = [
  { longText: 'Dubai', shortText: 'Dubai', types: ['locality', 'political'] },
  { longText: 'Dubai', shortText: 'Dubai', types: ['administrative_area_level_1', 'political'] },
  uae,
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Places Autocomplete request', () => {
  it('restricts to the UAE, biases to the whole UAE, and sends the key in a header', () => {
    const request = buildAutocompleteRequest('Dubai Marina', KEY, SESSION, 'en');
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(request.url).not.toContain(KEY);
    expect(request.headers['X-Goog-Api-Key']).toBe(KEY);
    expect(request.headers['X-Goog-FieldMask']).toContain('suggestions.placePrediction.placeId');
    expect(body(request)).toMatchObject({
      input: 'Dubai Marina',
      sessionToken: SESSION,
      includedRegionCodes: ['ae'],
      languageCode: 'en',
      locationBias: { rectangle: { low: { latitude: 22.5, longitude: 51 }, high: { latitude: 26.5, longitude: 56.5 } } },
    });
    // No type filter: businesses, buildings, parks, streets and areas all come back.
    expect(body(request)).not.toHaveProperty('includedPrimaryTypes');
  });

  it('biases toward the other end of the trip when known', () => {
    const request = buildAutocompleteRequest('JBR', KEY, SESSION, 'en', { lat: 25.08, lng: 55.14 });
    expect(body(request).locationBias).toEqual({ circle: { center: { latitude: 25.08, longitude: 55.14 }, radius: 50000 } });
  });

  it('sends Arabic input exactly as typed, asking for Arabic results', () => {
    const request = buildAutocompleteRequest('دبي مارينا', KEY, SESSION, 'ar');
    expect(body(request)).toMatchObject({ input: 'دبي مارينا', languageCode: 'ar' });
  });

  it('can be pointed at a local fake for end-to-end tests', () => {
    vi.stubEnv('GOOGLE_MAPS_API_URL', 'http://127.0.0.1:4010');
    expect(buildAutocompleteRequest('x', KEY, SESSION, 'en').url).toBe('http://127.0.0.1:4010/v1/places:autocomplete');
    expect(buildRouteRequest({ coordinates: { lat: 25, lng: 55 } }, { coordinates: { lat: 25.1, lng: 55.1 } }, KEY).url).toBe('http://127.0.0.1:4010/directions/v2:computeRoutes');
  });
});

describe('Places Autocomplete response', () => {
  it('turns predictions into rows, cleaning Google\'s " - " separated UAE text', () => {
    const rows = parseAutocompleteResponse({
      suggestions: [
        {
          placePrediction: {
            placeId: 'ChIJ-marina-gate',
            text: { text: 'Marina Gate 1 - Dubai Marina - Dubai - United Arab Emirates' },
            structuredFormat: { mainText: { text: 'Marina Gate 1' }, secondaryText: { text: 'Dubai Marina - Dubai - United Arab Emirates' } },
            types: ['premise', 'point_of_interest', 'establishment'],
          },
        },
        {
          placePrediction: {
            placeId: 'ChIJ-business-bay',
            text: { text: 'Business Bay - Dubai - United Arab Emirates' },
            structuredFormat: { mainText: { text: 'Business Bay' }, secondaryText: { text: 'Dubai - United Arab Emirates' } },
            types: ['sublocality_level_1', 'sublocality', 'political', 'geocode'],
          },
        },
        // Query predictions have no place; they're skipped.
        { placePrediction: undefined },
      ],
    });
    expect(rows).toEqual([
      { id: 'ChIJ-marina-gate', name: 'Marina Gate 1', secondary: 'Dubai Marina, Dubai, UAE', featureType: 'poi', resolved: null },
      { id: 'ChIJ-business-bay', name: 'Business Bay', secondary: 'Dubai, UAE', featureType: 'area', resolved: null },
    ]);
  });

  it('formats Arabic results with the Arabic comma and country name', () => {
    const [row] = parseAutocompleteResponse(
      {
        suggestions: [
          {
            placePrediction: {
              placeId: 'ChIJ-burj',
              structuredFormat: { mainText: { text: 'برج خليفة' }, secondaryText: { text: 'دبي - الإمارات العربية المتحدة' } },
              types: ['point_of_interest', 'establishment'],
            },
          },
        ],
      },
      'ar',
    );
    expect(row.secondary).toBe('دبي، الإمارات');
  });

  it('returns no rows for an empty response', () => {
    expect(parseAutocompleteResponse({})).toEqual([]);
  });
});

describe('Place Details', () => {
  it('builds a GET that ends the session, and refuses anything that is not a place id', () => {
    const request = buildPlaceDetailsRequest('ChIJ-marina-gate', KEY, SESSION, 'ar');
    expect(request.method).toBe('GET');
    expect(request.url).toContain('/v1/places/ChIJ-marina-gate?');
    expect(request.url).toContain(`sessionToken=${SESSION}`);
    expect(request.url).toContain('languageCode=ar');
    expect(request.headers['X-Goog-FieldMask']).toBe('id,displayName,formattedAddress,location,addressComponents,types');
    expect(() => buildPlaceDetailsRequest('../../v1/other', KEY, SESSION, 'en')).toThrow(MapsProviderError);
  });

  it('keeps the Place ID, coordinates and a clean address for a business', () => {
    const location = parsePlaceDetailsResponse({
      id: 'ChIJ-marina-gate',
      displayName: { text: 'Marina Gate 1' },
      formattedAddress: 'Marina Gate 1 - King Salman Bin Abdulaziz Al Saud St - Dubai Marina - Dubai - United Arab Emirates',
      location: { latitude: 25.0869, longitude: 55.1476 },
      types: ['premise', 'point_of_interest', 'establishment'],
      addressComponents: [
        { longText: 'King Salman Bin Abdulaziz Al Saud Street', shortText: 'King Salman St', types: ['route'] },
        { longText: 'Dubai Marina', shortText: 'Dubai Marina', types: ['sublocality_level_1', 'sublocality', 'political'] },
        ...dubai,
      ],
    });
    expect(location.coordinates).toEqual({ lat: 25.0869, lng: 55.1476 });
    expect(location.place).toMatchObject({
      placeId: 'ChIJ-marina-gate',
      name: 'Marina Gate 1',
      street: 'King Salman Bin Abdulaziz Al Saud Street',
      neighborhood: 'Dubai Marina',
      city: 'Dubai',
      region: 'Dubai',
      country: 'United Arab Emirates',
    });
    expect(location.formattedAddress).toBe('Marina Gate 1, King Salman Bin Abdulaziz Al Saud Street, Dubai Marina, Dubai, UAE');
  });

  it('files an area\'s own name as the neighbourhood, not a place name', () => {
    const location = parsePlaceDetailsResponse({
      id: 'ChIJ-al-nahda',
      displayName: { text: 'Al Nahda' },
      location: { latitude: 25.3, longitude: 55.37 },
      types: ['sublocality_level_1', 'sublocality', 'political'],
      addressComponents: [
        { longText: 'Sharjah', shortText: 'Sharjah', types: ['locality', 'political'] },
        { longText: 'Sharjah', shortText: 'Sharjah', types: ['administrative_area_level_1', 'political'] },
        uae,
      ],
    });
    expect(location.place.name).toBeNull();
    expect(location.place.neighborhood).toBe('Al Nahda');
    expect(location.formattedAddress).toBe('Al Nahda, Sharjah, UAE');
  });

  it('refuses a place without coordinates', () => {
    expect(() => parsePlaceDetailsResponse({ id: 'x' })).toThrow(MapsProviderError);
    expect(() => parsePlaceDetailsResponse({})).toThrow(MapsProviderError);
  });
});

describe('Text Search (the fallback search)', () => {
  it('restricts to the UAE rectangle', () => {
    const request = buildTextSearchRequest('warehouse al quoz 3', KEY, 'en');
    expect(request.url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(request.headers['X-Goog-FieldMask']).toContain('places.location');
    expect(body(request)).toMatchObject({ textQuery: 'warehouse al quoz 3', regionCode: 'ae', languageCode: 'en', pageSize: 6 });
    expect(body(request).locationRestriction.rectangle).toBeDefined();
  });

  it('returns rows that already carry coordinates, dropping places outside the UAE', () => {
    const rows = parseTextSearchResponse({
      places: [
        {
          id: 'ChIJ-dip',
          displayName: { text: 'Dubai Investments Park' },
          location: { latitude: 24.99, longitude: 55.17 },
          types: ['sublocality_level_1', 'political'],
          addressComponents: dubai,
        },
        {
          id: 'ChIJ-khasab',
          displayName: { text: 'Khasab Port' },
          location: { latitude: 26.2, longitude: 56.25 },
          types: ['point_of_interest'],
          addressComponents: [{ longText: 'Oman', shortText: 'OM', types: ['country', 'political'] }],
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'ChIJ-dip', name: 'Dubai Investments Park', featureType: 'area' });
    expect(rows[0].resolved?.coordinates).toEqual({ lat: 24.99, lng: 55.17 });
    expect(rows[0].resolved?.place.placeId).toBe('ChIJ-dip');
  });
});

describe('Reverse geocoding (dropped pins)', () => {
  it('sends the coordinates and language, with the key as a query parameter', () => {
    const request = buildReverseGeocodeRequest({ lat: 25.2, lng: 55.27 }, KEY, 'ar');
    expect(request.url).toMatch(/^https:\/\/maps\.googleapis\.com\/maps\/api\/geocode\/json\?/);
    expect(request.url).toContain('latlng=25.2%2C55.27');
    expect(request.url).toContain('language=ar');
  });

  it('skips bare plus codes, keeps the exact pin, and borrows the emirate from a wider result', () => {
    const pin = { lat: 25.197197, lng: 55.274376 };
    const location = parseReverseGeocodeResponse(
      {
        status: 'OK',
        results: [
          {
            place_id: 'plus',
            types: ['plus_code'],
            formatted_address: '5783+VQ Dubai - United Arab Emirates',
            address_components: [{ long_name: '5783+VQ', short_name: '5783+VQ', types: ['plus_code'] }],
          },
          {
            place_id: 'ChIJ-street',
            types: ['street_address'],
            formatted_address: '1 Sheikh Mohammed bin Rashid Blvd - Downtown Dubai - Dubai - United Arab Emirates',
            geometry: { location: { lat: 25.1972, lng: 55.2744 } },
            address_components: [
              { long_name: 'Burj Khalifa', short_name: 'Burj Khalifa', types: ['premise'] },
              { long_name: '1', short_name: '1', types: ['street_number'] },
              { long_name: 'Sheikh Mohammed bin Rashid Boulevard', short_name: 'Sheikh Mohammed bin Rashid Blvd', types: ['route'] },
              { long_name: 'Downtown Dubai', short_name: 'Downtown Dubai', types: ['neighborhood', 'political'] },
              { long_name: 'Dubai', short_name: 'Dubai', types: ['locality', 'political'] },
            ],
          },
          {
            place_id: 'ChIJ-dubai',
            types: ['administrative_area_level_1', 'political'],
            address_components: [
              { long_name: 'Dubai', short_name: 'Dubai', types: ['administrative_area_level_1', 'political'] },
              { long_name: 'United Arab Emirates', short_name: 'AE', types: ['country', 'political'] },
            ],
          },
        ],
      },
      pin,
    );
    expect(location.coordinates).toEqual(pin);
    expect(location.place).toMatchObject({
      placeId: 'ChIJ-street',
      name: 'Burj Khalifa',
      street: '1 Sheikh Mohammed bin Rashid Boulevard',
      neighborhood: 'Downtown Dubai',
      region: 'Dubai',
      country: 'United Arab Emirates',
    });
    expect(location.formattedAddress).toBe('Burj Khalifa, 1 Sheikh Mohammed bin Rashid Boulevard, Downtown Dubai, Dubai, UAE');
  });

  it('treats no address (the sea, the desert) and refused keys as failures', () => {
    const pin = { lat: 25, lng: 54 };
    expect(() => parseReverseGeocodeResponse({ status: 'ZERO_RESULTS', results: [] }, pin)).toThrow('No address found');
    // HTTP 200 with a refusal inside: must not look like success.
    expect(() => parseReverseGeocodeResponse({ status: 'REQUEST_DENIED', error_message: 'API key not authorized' }, pin)).toThrow(
      /REQUEST_DENIED/,
    );
  });
});

describe('Forward geocoding (staff CSV import)', () => {
  it('restricts to the UAE', () => {
    const request = buildForwardGeocodeRequest('Al Reem Island, Abu Dhabi', KEY);
    expect(request.url).toContain('components=country%3AAE');
    expect(request.url).toContain('region=ae');
  });

  it('returns the first match, or null when there is none', () => {
    expect(
      parseForwardGeocodeResponse({
        status: 'OK',
        results: [{ formatted_address: 'Al Reem Island - Abu Dhabi - United Arab Emirates', geometry: { location: { lat: 24.49, lng: 54.4 } } }],
      }),
    ).toEqual({ formattedAddress: 'Al Reem Island, Abu Dhabi, UAE', coordinates: { lat: 24.49, lng: 54.4 } });
    expect(parseForwardGeocodeResponse({ status: 'ZERO_RESULTS', results: [] })).toBeNull();
  });
});

describe('Routes API', () => {
  it('asks for the traffic-aware driving route at the reference departure time (as Google Maps routes it)', () => {
    const request = buildRouteRequest(
      { coordinates: { lat: 25.08, lng: 55.14 } },
      { coordinates: { lat: 25.19, lng: 55.27 } },
      KEY,
      '2026-10-12T05:00:00.000Z',
    );
    expect(request.headers['X-Goog-FieldMask']).toBe('routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline');
    expect(body(request)).toMatchObject({
      origin: { location: { latLng: { latitude: 25.08, longitude: 55.14 } } },
      destination: { location: { latLng: { latitude: 25.19, longitude: 55.27 } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      departureTime: '2026-10-12T05:00:00.000Z',
      computeAlternativeRoutes: false,
    });
  });

  it('defaults to the reference departure time, which is always in the future', () => {
    const request = buildRouteRequest({ coordinates: { lat: 25.08, lng: 55.14 } }, { coordinates: { lat: 25.19, lng: 55.27 } }, KEY);
    expect(body(request).departureTime).toBe(referenceDepartureTime());
    expect(Date.parse(body(request).departureTime)).toBeGreaterThan(Date.now());
  });

  it('allows toll roads, highways and ferries (the ordinary driving route)', () => {
    const request = buildRouteRequest({ coordinates: { lat: 25.08, lng: 55.14 } }, { coordinates: { lat: 25.19, lng: 55.27 } }, KEY);
    expect(body(request).routeModifiers).toEqual({ avoidTolls: false, avoidHighways: false, avoidFerries: false });
  });

  it.each([
    ['under 5 km', 4270, 4.27],
    ['just over 5 km', 5010, 5.01],
    ['a toll-road (Salik) route', 52400, 52.4],
    ['a long cross-emirate route', 131876, 131.876],
  ])('uses Google\'s total distance exactly as returned: %s', (_label, meters, km) => {
    const route = parseRouteResponse({ routes: [{ distanceMeters: meters, duration: '600s' }] });
    expect(route.distanceMeters).toBe(meters);
    expect(route.distanceKm).toBe(km);
  });

  it('refuses a malformed distance instead of pricing it', () => {
    expect(() => parseRouteResponse({ routes: [{ distanceMeters: -5 }] })).toThrow(MapsProviderError);
    expect(() => parseRouteResponse({ routes: [{ distanceMeters: Number.NaN }] })).toThrow(MapsProviderError);
    expect(() => parseRouteResponse({ routes: [{ distanceMeters: '5000' as unknown as number }] })).toThrow(MapsProviderError);
  });

  it('routes a selected place by its Place ID, and a pin by its exact coordinates', () => {
    const request = buildRouteRequest(
      { coordinates: { lat: 25.1972, lng: 55.2744 }, placeId: 'ChIJ-dubai-mall_1' },
      { coordinates: { lat: 25.2048493, lng: 55.2707828 } },
      KEY,
    );
    expect(body(request).origin).toEqual({ placeId: 'ChIJ-dubai-mall_1' });
    // Full precision, and only snapped to a road a vehicle can stop on.
    expect(body(request).destination).toEqual({
      location: { latLng: { latitude: 25.2048493, longitude: 55.2707828 } },
      vehicleStopover: true,
    });
  });

  it('never sends a malformed Place ID to Google (routes the coordinates instead)', () => {
    const request = buildRouteRequest({ coordinates: { lat: 25, lng: 55 }, placeId: '../x' }, { coordinates: { lat: 25.1, lng: 55.1 } }, KEY);
    expect(body(request).origin).toEqual({ location: { latLng: { latitude: 25, longitude: 55 } }, vehicleStopover: true });
  });

  it('reads distance, duration and the road path', () => {
    const route = parseRouteResponse({
      routes: [{ distanceMeters: 14823, duration: '1260s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' } }],
    });
    expect(route.distanceMeters).toBe(14823);
    expect(route.distanceKm).toBe(14.823);
    expect(route.durationSeconds).toBe(1260);
    expect(route.durationMinutes).toBe(21);
    expect(route.path).toHaveLength(3);
  });

  it('throws when Google finds no drivable route', () => {
    expect(() => parseRouteResponse({})).toThrow(MapsProviderError);
  });

  it('decodes Google\'s reference polyline', () => {
    // The example from Google's Encoded Polyline Algorithm documentation.
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });
});

describe('referenceDepartureTime (next working day, 09:00 Dubai = 05:00 UTC)', () => {
  it.each([
    ['Monday 10:00', '2026-10-05T06:00:00Z', '2026-10-06T05:00:00.000Z'],
    ['Monday 03:00, before the reference hour', '2026-10-04T23:00:00Z', '2026-10-06T05:00:00.000Z'],
    ['Thursday 23:30', '2026-10-08T19:30:00Z', '2026-10-09T05:00:00.000Z'],
    ['Friday 08:00', '2026-10-09T04:00:00Z', '2026-10-12T05:00:00.000Z'],
    ['Friday 01:00 (still Thursday in UTC)', '2026-10-08T21:00:00Z', '2026-10-12T05:00:00.000Z'],
    ['Saturday', '2026-10-10T12:00:00Z', '2026-10-12T05:00:00.000Z'],
    ['Sunday', '2026-10-11T12:00:00Z', '2026-10-12T05:00:00.000Z'],
    ['New Year’s Eve, Thursday', '2026-12-31T10:00:00Z', '2027-01-01T05:00:00.000Z'],
  ])('%s (Dubai time)', (_label, now, expected) => {
    expect(referenceDepartureTime(new Date(now))).toBe(expected);
  });

  it('is the same all day in Dubai, so a quote and a booking made that day share it', () => {
    const morning = referenceDepartureTime(new Date('2026-10-06T20:00:01Z')); // Wed 00:00:01
    const night = referenceDepartureTime(new Date('2026-10-07T19:59:59Z')); // Wed 23:59:59
    expect(morning).toBe(night);
    expect(morning).toBe('2026-10-08T05:00:00.000Z');
  });
});

describe('display helpers', () => {
  it('drops P.O. box numbers and repeated names', () => {
    expect(cleanPlaceText('Al Quoz - Dubai - 12345 - Dubai - United Arab Emirates')).toBe('Al Quoz, Dubai, UAE');
  });

  it('classifies place types for the dropdown icon', () => {
    expect(featureTypeOf(['park', 'point_of_interest', 'establishment'])).toBe('poi');
    expect(featureTypeOf(['street_address'])).toBe('address');
    expect(featureTypeOf(['route'])).toBe('street');
    expect(featureTypeOf(['locality', 'political'])).toBe('area');
  });

  it('splits Arabic addresses into a title and subtitle', () => {
    expect(splitAddress('برج خليفة، وسط مدينة دبي، دبي، الإمارات')).toEqual({
      title: 'برج خليفة',
      subtitle: 'وسط مدينة دبي، دبي، الإمارات',
      pinnedCoordinates: null,
    });
  });
});
