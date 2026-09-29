import { describe, expect, it } from 'vitest';

import {
  MapsProviderError,
  buildRetrieveUrl,
  buildReverseGeocodeUrl,
  buildSuggestUrl,
  cleanPlaceText,
  parseGeocodeSuggestions,
  parseRetrieveResponse,
  parseReverseGeocodeResponse,
  parseSuggestResponse,
} from '@/lib/maps/mapbox-client';

const TOKEN = 'sk.test-token';
const SESSION = '11111111-1111-4111-8111-111111111111';

// Fixtures are trimmed copies of real Search Box / Geocoding v6 responses
// for UAE queries (captured September 2026).

describe('buildSuggestUrl', () => {
  it('uses the Search Box API, restricted to the UAE, in English, with the session token', () => {
    const url = new URL(buildSuggestUrl('Marina Gate', TOKEN, SESSION));
    expect(url.origin + url.pathname).toBe('https://api.mapbox.com/search/searchbox/v1/suggest');
    expect(url.searchParams.get('q')).toBe('Marina Gate');
    expect(url.searchParams.get('country')).toBe('ae');
    expect(url.searchParams.get('language')).toBe('en');
    expect(url.searchParams.get('session_token')).toBe(SESSION);
    // No types filter: POIs, buildings, streets and areas all come back.
    expect(url.searchParams.has('types')).toBe(false);
    expect(url.searchParams.has('proximity')).toBe(false);
  });

  it('adds a proximity bias as lng,lat when given', () => {
    const url = new URL(buildSuggestUrl('mall', TOKEN, SESSION, { lat: 25.08, lng: 55.14 }));
    expect(url.searchParams.get('proximity')).toBe('55.14,25.08');
  });
});

describe('parseSuggestResponse', () => {
  const json = {
    suggestions: [
      {
        mapbox_id: 'poi.marina-gate',
        name: 'Marina Gate',
        feature_type: 'poi',
        place_formatted: 'Dubai, 2344, United Arab Emirates',
        context: { place: { name: 'Dubai' }, neighborhood: { name: 'Marsa Dubai' }, postcode: { name: '2344' } },
      },
      {
        mapbox_id: 'poi.warehouse',
        name: 'Warehouse 122 , Dubai Textile City',
        feature_type: 'poi',
        place_formatted: 'Dubai Textile City, behind Dragon Mart 2, Dubai, 79506, United Arab Emirates',
      },
      { mapbox_id: 'cat.restaurant', name: 'Restaurants', feature_type: 'category' },
      {
        mapbox_id: 'addr.24',
        name: '24 Jumeira Street',
        feature_type: 'address',
        place_formatted: 'Jumeira First, Dubai, Dubai, United Arab Emirates',
        context: { neighborhood: { name: 'Jumeira First' }, place: { name: 'Dubai' } },
      },
    ],
  };

  it('keeps places (POIs, buildings, addresses) and drops category rows', () => {
    expect(parseSuggestResponse(json).map((s) => s.id)).toEqual(['poi.marina-gate', 'poi.warehouse', 'addr.24']);
  });

  it('shows a clean "area, city, UAE" line without P.O. box numbers or the full country name', () => {
    const [marinaGate, warehouse, villa] = parseSuggestResponse(json);
    expect(marinaGate.secondary).toBe('Marsa Dubai, Dubai, UAE');
    expect(warehouse.secondary).toBe('Dubai Textile City, behind Dragon Mart 2, Dubai, UAE');
    expect(villa.secondary).toBe('Jumeira First, Dubai, UAE');
    expect(marinaGate.resolved).toBeNull();
  });

  it('returns an empty list for no suggestions', () => {
    expect(parseSuggestResponse({})).toEqual([]);
  });
});

describe('retrieve', () => {
  it('builds the retrieve URL with the same session token', () => {
    const url = new URL(buildRetrieveUrl('dXJuOm1ieHBvaTpjMDdj', TOKEN, SESSION));
    expect(url.pathname).toBe('/search/searchbox/v1/retrieve/dXJuOm1ieHBvaTpjMDdj');
    expect(url.searchParams.get('session_token')).toBe(SESSION);
  });

  it('returns coordinates plus structured address parts', () => {
    const result = parseRetrieveResponse({
      features: [
        {
          geometry: { type: 'Point', coordinates: [55.14762051, 25.08687423] },
          properties: {
            name: 'Marina Gate',
            feature_type: 'poi',
            context: {
              country: { name: 'United Arab Emirates' },
              postcode: { name: '2344' },
              place: { name: 'Dubai' },
              neighborhood: { name: 'Marsa Dubai' },
              address: { name: 'King Salman Bin Abdulaziz Al Saud St' },
              street: { name: 'king salman bin abdulaziz al saud st' },
            },
          },
        },
      ],
    });
    expect(result.coordinates).toEqual({ lat: 25.08687423, lng: 55.14762051 });
    expect(result.place).toMatchObject({
      name: 'Marina Gate',
      street: 'King Salman Bin Abdulaziz Al Saud St',
      neighborhood: 'Marsa Dubai',
      city: 'Dubai',
      postcode: '2344',
      country: 'United Arab Emirates',
    });
    expect(result.formattedAddress).toBe('Marina Gate, King Salman Bin Abdulaziz Al Saud St, Marsa Dubai, Dubai, UAE');
  });

  it('puts an area result (e.g. a neighbourhood) in the neighbourhood slot', () => {
    const result = parseRetrieveResponse({
      features: [
        {
          geometry: { type: 'Point', coordinates: [55.2, 25.13] },
          properties: { name: 'Al Quoz Industrial Area Third', feature_type: 'neighborhood', context: { place: { name: 'Dubai' } } },
        },
      ],
    });
    expect(result.place.name).toBeNull();
    expect(result.formattedAddress).toBe('Al Quoz Industrial Area Third, Dubai, UAE');
  });

  it('throws MapsProviderError when nothing comes back', () => {
    expect(() => parseRetrieveResponse({ features: [] })).toThrow(MapsProviderError);
  });
});

describe('reverse geocoding a dropped pin', () => {
  it('asks for English and a single result', () => {
    const url = new URL(buildReverseGeocodeUrl({ lat: 25.0869, lng: 55.1406 }, TOKEN));
    expect(url.searchParams.get('language')).toBe('en');
    expect(url.searchParams.get('limit')).toBe('1');
  });

  it('keeps the exact pin coordinates, not the matched feature coordinates', () => {
    const pin = { lat: 25.086912, lng: 55.140611 };
    const result = parseReverseGeocodeResponse(
      {
        features: [
          {
            geometry: { type: 'Point', coordinates: [55.1401, 25.0871] },
            properties: {
              name: 'Al Seyahi Street',
              feature_type: 'street',
              context: {
                street: { name: 'Al Seyahi Street' },
                neighborhood: { name: 'Marsa Dubai' },
                place: { name: 'Dubai' },
                region: { name: 'Dubai' },
                country: { name: 'United Arab Emirates' },
              },
            },
          },
        ],
      },
      pin,
    );
    expect(result.coordinates).toEqual(pin);
    expect(result.formattedAddress).toBe('Al Seyahi Street, Marsa Dubai, Dubai, UAE');
    expect(result.place.street).toBe('Al Seyahi Street');
  });

  it('throws when there is no address at that point, so the caller can keep the coordinates', () => {
    expect(() => parseReverseGeocodeResponse({ features: [] }, { lat: 25, lng: 55 })).toThrow(MapsProviderError);
  });
});

describe('fallback geocoding suggestions', () => {
  it('arrive already resolved, so no retrieve call is needed', () => {
    const [row] = parseGeocodeSuggestions({
      features: [
        {
          geometry: { type: 'Point', coordinates: [55.14, 25.08] },
          properties: {
            mapbox_id: 'street.1',
            name: 'Marina Walk',
            feature_type: 'street',
            place_formatted: 'Marsa Dubai, Dubai, Dubai, United Arab Emirates',
          },
        },
      ],
    });
    expect(row.id).toBe('street.1');
    expect(row.secondary).toBe('Marsa Dubai, Dubai, UAE');
    expect(row.resolved?.coordinates).toEqual({ lat: 25.08, lng: 55.14 });
  });
});

describe('cleanPlaceText', () => {
  it('drops numeric P.O. boxes, repeated names and the country, then adds UAE once', () => {
    expect(cleanPlaceText('Dubai, Dubai, 2344, United Arab Emirates')).toBe('Dubai, UAE');
    expect(cleanPlaceText('')).toBe('UAE');
  });
});
