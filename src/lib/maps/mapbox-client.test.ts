import { describe, expect, it } from 'vitest';

import {
  MapsProviderError,
  buildDirectionsUrl,
  buildForwardGeocodeUrl,
  buildReverseGeocodeUrl,
  parseDirectionsResponse,
  parseGeocodeResponse,
  parseSingleGeocodeResponse,
} from '@/lib/maps/mapbox-client';

const TOKEN = 'pk.test-token';

describe('buildForwardGeocodeUrl', () => {
  it('includes the query, token, UAE country/bbox bias, and default limit', () => {
    const url = buildForwardGeocodeUrl('Dubai Marina Mall', TOKEN);
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe('https://api.mapbox.com/search/geocode/v6/forward');
    expect(parsed.searchParams.get('q')).toBe('Dubai Marina Mall');
    expect(parsed.searchParams.get('access_token')).toBe(TOKEN);
    expect(parsed.searchParams.get('country')).toBe('ae');
    expect(parsed.searchParams.get('limit')).toBe('5');
    expect(parsed.searchParams.get('autocomplete')).toBe('true');
    expect(parsed.searchParams.get('bbox')).toBe('51,22.5,56.5,26.5');
  });

  it('respects a custom limit', () => {
    const url = buildForwardGeocodeUrl('JBR', TOKEN, { limit: 3 });
    expect(new URL(url).searchParams.get('limit')).toBe('3');
  });

  it('URL-encodes special characters in the query', () => {
    const url = buildForwardGeocodeUrl('Al Wasl & 2nd St', TOKEN);
    expect(new URL(url).searchParams.get('q')).toBe('Al Wasl & 2nd St');
    expect(url).not.toContain(' ');
  });
});

describe('buildReverseGeocodeUrl', () => {
  it('sends longitude/latitude as separate params, not combined', () => {
    const url = buildReverseGeocodeUrl({ lat: 25.2048, lng: 55.2708 }, TOKEN);
    const parsed = new URL(url);

    expect(parsed.searchParams.get('longitude')).toBe('55.2708');
    expect(parsed.searchParams.get('latitude')).toBe('25.2048');
  });
});

describe('buildDirectionsUrl', () => {
  it('orders coordinates as lng,lat and origin;destination, with geojson geometry requested', () => {
    const url = buildDirectionsUrl(
      { lat: 25.0772, lng: 55.1409 }, // origin: Dubai Marina
      { lat: 25.2048, lng: 55.2708 }, // destination: Downtown Dubai
      TOKEN,
    );

    expect(url).toContain('/directions/v5/mapbox/driving/55.1409,25.0772;55.2708,25.2048');
    expect(new URL(url).searchParams.get('geometries')).toBe('geojson');
    expect(new URL(url).searchParams.get('overview')).toBe('full');
  });
});

describe('parseGeocodeResponse', () => {
  it('maps Mapbox v6 features to GeocodeResult[], preferring full_address', () => {
    const result = parseGeocodeResponse({
      features: [
        {
          geometry: { type: 'Point', coordinates: [55.1409, 25.0772] },
          properties: {
            full_address: 'Dubai Marina Mall, Dubai, United Arab Emirates',
            name: 'Dubai Marina Mall',
            place_formatted: 'Dubai, United Arab Emirates',
          },
        },
      ],
    });

    expect(result).toEqual([
      {
        formattedAddress: 'Dubai Marina Mall, Dubai, United Arab Emirates',
        coordinates: { lat: 25.0772, lng: 55.1409 },
      },
    ]);
  });

  it('falls back to name + place_formatted when full_address is missing', () => {
    const result = parseGeocodeResponse({
      features: [
        {
          geometry: { type: 'Point', coordinates: [55.27, 25.2] },
          properties: { name: 'Some Tower', place_formatted: 'Dubai, UAE' },
        },
      ],
    });

    expect(result[0].formattedAddress).toBe('Some Tower, Dubai, UAE');
  });

  it('returns an empty array when there are no features, rather than throwing', () => {
    expect(parseGeocodeResponse({})).toEqual([]);
    expect(parseGeocodeResponse({ features: [] })).toEqual([]);
  });
});

describe('parseSingleGeocodeResponse', () => {
  it('returns the first result', () => {
    const result = parseSingleGeocodeResponse({
      features: [
        {
          geometry: { type: 'Point', coordinates: [55.1409, 25.0772] },
          properties: { full_address: 'First Result' },
        },
        {
          geometry: { type: 'Point', coordinates: [55.27, 25.2] },
          properties: { full_address: 'Second Result' },
        },
      ],
    });

    expect(result.formattedAddress).toBe('First Result');
  });

  it('throws MapsProviderError when there are no features', () => {
    expect(() => parseSingleGeocodeResponse({ features: [] })).toThrow(MapsProviderError);
  });
});

describe('parseDirectionsResponse', () => {
  it('converts meters to km and seconds to minutes', () => {
    const result = parseDirectionsResponse({
      code: 'Ok',
      routes: [
        {
          distance: 14600, // 14.6 km
          duration: 1080, // 18 minutes
          geometry: {
            type: 'LineString',
            coordinates: [
              [55.1409, 25.0772],
              [55.27, 25.2],
            ],
          },
        },
      ],
    });

    expect(result.distanceKm).toBeCloseTo(14.6);
    expect(result.durationMinutes).toBeCloseTo(18);
    expect(result.geometry.coordinates).toHaveLength(2);
  });

  it('throws MapsProviderError when Mapbox returns no route', () => {
    expect(() => parseDirectionsResponse({ code: 'NoRoute', routes: [] })).toThrow(MapsProviderError);
  });

  it('throws MapsProviderError when routes is missing entirely', () => {
    expect(() => parseDirectionsResponse({ code: 'Ok' })).toThrow(MapsProviderError);
  });
});
