import { UAE_BBOX } from '@/lib/maps/config';

import type { Coordinates } from '@/lib/types';
import type {
  GeocodeResult,
  LocationSuggestion,
  MapsLanguage,
  PlaceDetails,
  ResolvedLocation,
  RouteResult,
  RouteWaypoint,
} from '@/lib/maps/types';

// Pure request builders and response parsers for Google Maps Platform — no
// fetch calls, so all of it is unit-tested without the network
// (google-client.test.ts). google-provider.ts does the fetching.
//
// GOOGLE_MAPS_API_URL exists only so the end-to-end suite can point every
// Google endpoint at one local fake (e2e/stack/fake-google-maps.mjs). The
// endpoint paths are distinct, so one host serves them all. Unset in real
// deployments.
const override = () => process.env.GOOGLE_MAPS_API_URL || null;
const placesBase = () => override() ?? 'https://places.googleapis.com';
const geocodingBase = () => override() ?? 'https://maps.googleapis.com';
const routesBase = () => override() ?? 'https://routes.googleapis.com';

export class MapsProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapsProviderError';
  }
}

export type ApiRequest = {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
};

const jsonHeaders = (key: string, fieldMask: string) => ({
  'Content-Type': 'application/json',
  'X-Goog-Api-Key': key,
  'X-Goog-FieldMask': fieldMask,
});

// ── Display helpers ─────────────────────────────────────────────────────────
// Google's UAE addresses separate parts with " - " ("Marina Gate 1 - Dubai
// Marina - Dubai - United Arab Emirates") and often repeat the emirate as
// both city and region. Customers see a clean "Marina Gate 1, Dubai Marina,
// Dubai, UAE" instead, in the language they searched in.

const COUNTRY_NAMES = /^(united arab emirates|uae|الإمارات العربية المتحدة|الامارات العربية المتحدة|الإمارات)$/i;
const COUNTRY_LABEL: Record<MapsLanguage, string> = { en: 'UAE', ar: 'الإمارات' };
const SEPARATOR: Record<MapsLanguage, string> = { en: ', ', ar: '، ' };

const tidy = (value: string | null | undefined) => {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
};

type JoinOptions = { withCountry?: boolean; language?: MapsLanguage };

export const joinPlaceParts = (parts: (string | null | undefined)[], { withCountry = true, language = 'en' }: JoinOptions = {}) => {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const value = tidy(part);
    // Bare numbers are P.O. box "postcodes", not something a driver can use.
    if (!value || /^\d+$/.test(value) || COUNTRY_NAMES.test(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(value);
  }
  if (withCountry) kept.push(COUNTRY_LABEL[language]);
  return kept.join(SEPARATOR[language]);
};

// Splits Google's own formatted text (" - ", "," or the Arabic "،") and
// cleans it the same way — the fallback when there are no address parts.
export const cleanPlaceText = (text: string | null | undefined, options: JoinOptions = {}) =>
  joinPlaceParts((text ?? '').split(/\s+-\s+|[,،]/), options);

// "Marina Gate, King Salman Bin Abdulaziz Al Saud St, Dubai Marina, Dubai, UAE"
export const formatPlace = (place: PlaceDetails, language: MapsLanguage = 'en') =>
  joinPlaceParts([place.name, place.street, place.neighborhood, place.district, place.city ?? place.region], { language });

// ── Address components → PlaceDetails ───────────────────────────────────────
// Places (New) and the Geocoding API describe the same components with
// different field names; both are normalised to this shape first.

export type AddressComponent = { long: string; short: string; types: string[] };

type PlacesComponent = { longText?: string; shortText?: string; types?: string[] };
type GeocodingComponent = { long_name?: string; short_name?: string; types?: string[] };

const fromPlacesComponents = (components: PlacesComponent[] | undefined): AddressComponent[] =>
  (components ?? []).map((c) => ({ long: c.longText ?? '', short: c.shortText ?? '', types: c.types ?? [] }));

const fromGeocodingComponents = (components: GeocodingComponent[] | undefined): AddressComponent[] =>
  (components ?? []).map((c) => ({ long: c.long_name ?? '', short: c.short_name ?? '', types: c.types ?? [] }));

const component = (components: AddressComponent[], type: string) =>
  tidy(components.find((c) => c.types.includes(type))?.long);

// Place types that name an area or a road rather than a specific place — the
// place's own name then goes in the matching slot instead of `name`.
const AREA_TYPES = new Set([
  'locality',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
  'neighborhood',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'colloquial_area',
  'country',
  'postal_code',
  'political',
  'plus_code',
]);
const isAreaOrRoad = (types: string[]) => types.length > 0 && types.every((type) => AREA_TYPES.has(type) || type === 'route' || type === 'geocode');

export const placeFromComponents = (
  name: string | null,
  types: string[],
  components: AddressComponent[],
  placeId: string | null,
): PlaceDetails => {
  const route = component(components, 'route');
  const number = component(components, 'street_number');
  const street = route ? (number ? `${number} ${route}` : route) : null;
  const neighborhoodOnly = component(components, 'neighborhood');
  const sublocality = component(components, 'sublocality_level_1') ?? component(components, 'sublocality');
  const area = isAreaOrRoad(types);

  const place: PlaceDetails = {
    placeId,
    // A building Google knows as a "premise" (towers, villas) is its name
    // even when the result itself is a street address.
    name: area ? null : (tidy(name) ?? component(components, 'premise')),
    street,
    neighborhood: neighborhoodOnly ?? sublocality,
    district: neighborhoodOnly ? sublocality : null,
    city: component(components, 'locality'),
    region: component(components, 'administrative_area_level_1'),
    regionCode: null,
    postcode: component(components, 'postal_code'),
    country: component(components, 'country'),
    countryCode: tidy(components.find((c) => c.types.includes('country'))?.short)?.toUpperCase() ?? null,
  };
  // An area's own name ("Business Bay") belongs with the areas.
  if (area && name && !types.includes('route') && !place.neighborhood && tidy(name) !== place.city && tidy(name) !== place.region) {
    place.neighborhood = tidy(name);
  }
  // Numeric "names" are street numbers or P.O. boxes, not place names.
  if (place.name && (/^\d+$/.test(place.name) || place.name === street)) place.name = null;
  return place;
};

// Icon category for a dropdown row.
export const featureTypeOf = (types: string[] = []) => {
  if (types.includes('establishment') || types.includes('point_of_interest')) return 'poi';
  if (types.some((type) => ['street_address', 'premise', 'subpremise'].includes(type))) return 'address';
  if (types.includes('route')) return 'street';
  return 'area';
};

// The line under a suggestion's name, without repeating the name itself.
const secondaryLine = (name: string, text: string | null | undefined, language: MapsLanguage) =>
  joinPlaceParts(
    (text ?? '').split(/\s+-\s+|[,،]/).filter((part) => part.trim().toLowerCase() !== name.toLowerCase()),
    { language },
  );

const resolvedFrom = (
  name: string | null,
  types: string[],
  components: AddressComponent[],
  placeId: string | null,
  coordinates: Coordinates,
  formattedAddress: string | null | undefined,
  language: MapsLanguage,
): ResolvedLocation => {
  const place = placeFromComponents(name, types, components, placeId);
  const structured = formatPlace(place, language);
  // Fall back to Google's own text when the parts said nothing useful.
  const useful = structured !== COUNTRY_LABEL[language];
  return {
    coordinates,
    formattedAddress: useful ? structured : cleanPlaceText(formattedAddress ?? name, { language }),
    place,
  };
};

// UAE_BBOX is [minLng, minLat, maxLng, maxLat].
const UAE_RECTANGLE = {
  rectangle: {
    low: { latitude: UAE_BBOX[1], longitude: UAE_BBOX[0] },
    high: { latitude: UAE_BBOX[3], longitude: UAE_BBOX[2] },
  },
};

const latLng = ({ lat, lng }: Coordinates) => ({ latitude: lat, longitude: lng });

// Proximity bias radius: the maximum Places allows. Wide enough to cover a
// cross-emirate trip's other end, narrow enough to rank nearby places first.
const PROXIMITY_RADIUS_M = 50_000;

// ── Places API (New): Autocomplete + Place Details ──────────────────────────
// Autocomplete covers businesses, buildings, landmarks, parks, streets,
// communities and districts (no type filter). Results are restricted to the
// UAE by country code and biased toward the other end of the trip (or the
// whole UAE). One session token covers the keystrokes and the Place Details
// call that ends them, which Google bills as a single session.

const AUTOCOMPLETE_FIELDS = [
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.text.text',
  'suggestions.placePrediction.structuredFormat',
  'suggestions.placePrediction.types',
].join(',');

export const buildAutocompleteRequest = (
  query: string,
  key: string,
  sessionToken: string,
  language: MapsLanguage,
  proximity?: Coordinates,
): ApiRequest => ({
  url: `${placesBase()}/v1/places:autocomplete`,
  method: 'POST',
  headers: jsonHeaders(key, AUTOCOMPLETE_FIELDS),
  body: JSON.stringify({
    input: query,
    sessionToken,
    includedRegionCodes: ['ae'],
    regionCode: 'ae',
    languageCode: language,
    locationBias: proximity ? { circle: { center: latLng(proximity), radius: PROXIMITY_RADIUS_M } } : UAE_RECTANGLE,
  }),
});

type AutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      types?: string[];
    };
  }[];
};

export const parseAutocompleteResponse = (json: AutocompleteResponse, language: MapsLanguage = 'en'): LocationSuggestion[] =>
  (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> & { placeId: string } => Boolean(p?.placeId))
    .map((p) => {
      const name = tidy(p.structuredFormat?.mainText?.text) ?? tidy(p.text?.text) ?? p.placeId;
      return {
        id: p.placeId,
        name,
        secondary: secondaryLine(name, p.structuredFormat?.secondaryText?.text ?? p.text?.text, language),
        featureType: featureTypeOf(p.types),
        resolved: null,
      };
    });

const PLACE_FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents', 'types'];

// Google Place IDs are URL-safe; anything else never reaches Google.
const PLACE_ID = /^[A-Za-z0-9_-]{1,512}$/;

// sessionToken is null for the server's own coverage check of a place the
// customer already chose (a standalone Place Details request).
export const buildPlaceDetailsRequest = (id: string, key: string, sessionToken: string | null, language: MapsLanguage): ApiRequest => {
  if (!PLACE_ID.test(id)) throw new MapsProviderError('Invalid place id');
  const params = new URLSearchParams({ languageCode: language, regionCode: 'ae' });
  if (sessionToken) params.set('sessionToken', sessionToken);
  return {
    url: `${placesBase()}/v1/places/${id}?${params.toString()}`,
    method: 'GET',
    headers: jsonHeaders(key, PLACE_FIELDS.join(',')),
  };
};

type PlaceResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: PlacesComponent[];
  types?: string[];
};

const placeToResolved = (place: PlaceResponse, language: MapsLanguage): ResolvedLocation => {
  const { latitude, longitude } = place.location ?? {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new MapsProviderError('That place has no location');
  }
  return resolvedFrom(
    place.displayName?.text ?? null,
    place.types ?? [],
    fromPlacesComponents(place.addressComponents),
    place.id ?? null,
    { lat: latitude, lng: longitude },
    place.formattedAddress,
    language,
  );
};

export const parsePlaceDetailsResponse = (json: PlaceResponse, language: MapsLanguage = 'en'): ResolvedLocation => {
  if (!json?.id) throw new MapsProviderError('That place could not be found');
  return placeToResolved(json, language);
};

// ── Places API (New): Text Search ───────────────────────────────────────────
// The fallback when Autocomplete has nothing (or fails): a full search is
// more forgiving of incomplete addresses and descriptive queries ("warehouse
// near Al Quoz 3"), and returns places with coordinates in one call.

const TEXT_SEARCH_FIELDS = PLACE_FIELDS.map((field) => `places.${field}`).join(',');

export const buildTextSearchRequest = (query: string, key: string, language: MapsLanguage, pageSize = 6): ApiRequest => ({
  url: `${placesBase()}/v1/places:searchText`,
  method: 'POST',
  headers: jsonHeaders(key, TEXT_SEARCH_FIELDS),
  body: JSON.stringify({
    textQuery: query,
    languageCode: language,
    regionCode: 'ae',
    pageSize,
    locationRestriction: UAE_RECTANGLE,
  }),
});

type TextSearchResponse = { places?: PlaceResponse[] };

// The UAE rectangle also covers parts of Oman, Qatar and Saudi Arabia.
const inUae = (location: ResolvedLocation) => !location.place.country || COUNTRY_NAMES.test(location.place.country);

export const parseTextSearchResponse = (json: TextSearchResponse, language: MapsLanguage = 'en'): LocationSuggestion[] =>
  (json.places ?? [])
    .filter((place) => place.id && typeof place.location?.latitude === 'number')
    .map((place) => ({ place, resolved: placeToResolved(place, language) }))
    .filter(({ resolved }) => inUae(resolved))
    .map(({ place, resolved }) => {
      const name = tidy(place.displayName?.text) ?? resolved.formattedAddress;
      return {
        id: place.id as string,
        name,
        secondary: secondaryLine(name, resolved.formattedAddress, language),
        featureType: featureTypeOf(place.types),
        resolved,
      };
    });

// ── Geocoding API: reverse (pins, service areas) and forward (CSV) ──────────

type GeocodingResult = {
  place_id?: string;
  formatted_address?: string;
  address_components?: GeocodingComponent[];
  geometry?: { location?: { lat?: number; lng?: number } };
  types?: string[];
};

type GeocodingResponse = { status?: string; error_message?: string; results?: GeocodingResult[] };

// The Geocoding API answers HTTP 200 even when the key is refused, so the
// status field is what says whether it worked.
const checkGeocodingStatus = (json: GeocodingResponse) => {
  if (json.status === 'OK' || json.status === 'ZERO_RESULTS') return;
  throw new MapsProviderError(`Geocoding failed: ${json.status ?? 'no status'}${json.error_message ? ` (${json.error_message})` : ''}`);
};

export const buildReverseGeocodeRequest = (coordinates: Coordinates, key: string, language: MapsLanguage = 'en'): ApiRequest => {
  const params = new URLSearchParams({ latlng: `${coordinates.lat},${coordinates.lng}`, key, language });
  return { url: `${geocodingBase()}/maps/api/geocode/json?${params.toString()}`, method: 'GET', headers: {} };
};

// Keeps the exact coordinates that were asked about (a dropped pin), and
// uses Google only to describe them. Results come most specific first; bare
// plus codes ("7X4Q+XX") aren't addresses, so the first real one is used.
// The emirate, city and country are read from the whole set (plus codes
// included) if the best result omits them — every result describes the
// same point, and a spot with no street address (a new warehouse, open
// ground) is often only described by its plus code and city.
export const parseReverseGeocodeResponse = (json: GeocodingResponse, coordinates: Coordinates, language: MapsLanguage = 'en'): ResolvedLocation => {
  checkGeocodingStatus(json);
  const all = json.results ?? [];
  const best = all.find((r) => !(r.types ?? []).every((type) => type === 'plus_code')) ?? all[0];
  if (!best) throw new MapsProviderError('No address found at that point');

  const components = fromGeocodingComponents(best.address_components).filter((c) => !c.types.includes('plus_code'));
  const pool = all.flatMap((r) => fromGeocodingComponents(r.address_components));
  for (const type of ['administrative_area_level_1', 'locality', 'country']) {
    if (!components.some((c) => c.types.includes(type))) {
      const found = pool.find((c) => c.types.includes(type));
      if (found) components.push(found);
    }
  }
  return resolvedFrom(null, best.types ?? [], components, best.place_id ?? null, coordinates, best.formatted_address, language);
};

export const buildForwardGeocodeRequest = (address: string, key: string): ApiRequest => {
  const [minLng, minLat, maxLng, maxLat] = UAE_BBOX;
  const params = new URLSearchParams({
    address,
    key,
    language: 'en',
    region: 'ae',
    components: 'country:AE',
    bounds: `${minLat},${minLng}|${maxLat},${maxLng}`,
  });
  return { url: `${geocodingBase()}/maps/api/geocode/json?${params.toString()}`, method: 'GET', headers: {} };
};

// Null when Google has no match (the caller may try Text Search next).
export const parseForwardGeocodeResponse = (json: GeocodingResponse): GeocodeResult | null => {
  checkGeocodingStatus(json);
  const [first] = json.results ?? [];
  const { lat, lng } = first?.geometry?.location ?? {};
  if (!first || typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { formattedAddress: cleanPlaceText(first.formatted_address), coordinates: { lat, lng } };
};

// ── Routes API: driving distance, duration and path ─────────────────────────
// TRAFFIC_UNAWARE on purpose: the price is quoted in the booking wizard and
// recomputed by the server when the booking is made, so the route must not
// change between the two with live traffic. (It's also the Essentials SKU.)

const ROUTE_FIELDS = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline';

// A selected Google place is routed by its Place ID, so Google uses the
// place's own entrance/access points — the route Google Maps shows for it.
// A bare coordinate (dropped pin, device location) is snapped to the
// nearest road, which in the UAE is often the wrong carriageway of a
// highway (Sheikh Zayed Road, Al Khail Road) and adds U-turn detours;
// vehicleStopover limits the snap to roads a vehicle can stop on.
const routeWaypoint = ({ coordinates, placeId }: RouteWaypoint) =>
  placeId && PLACE_ID.test(placeId)
    ? { placeId }
    : { location: { latLng: latLng(coordinates) }, vehicleStopover: true };

export const buildRouteRequest = (origin: RouteWaypoint, destination: RouteWaypoint, key: string): ApiRequest => ({
  url: `${routesBase()}/directions/v2:computeRoutes`,
  method: 'POST',
  headers: jsonHeaders(key, ROUTE_FIELDS),
  body: JSON.stringify({
    origin: routeWaypoint(origin),
    destination: routeWaypoint(destination),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
    computeAlternativeRoutes: false,
    units: 'METRIC',
    regionCode: 'ae',
  }),
});

// Google's encoded polyline format (precision 5).
export const decodePolyline = (encoded: string): Coordinates[] => {
  const points: Coordinates[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
};

type RouteResponse = {
  routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
};

export const parseRouteResponse = (json: RouteResponse): RouteResult => {
  const [route] = json.routes ?? [];
  // An empty response ({}) means Google found no drivable route.
  if (!route) throw new MapsProviderError('Unable to calculate a route between these locations');
  const parsedSeconds = Number.parseFloat((route.duration ?? '0s').replace(/s$/, ''));
  const seconds = Number.isFinite(parsedSeconds) ? parsedSeconds : 0;
  // distanceMeters is omitted when zero; validateRoute refuses that.
  const meters = route.distanceMeters ?? 0;
  return {
    distanceMeters: meters,
    distanceKm: meters / 1000,
    durationSeconds: seconds,
    durationMinutes: seconds / 60,
    path: route.polyline?.encodedPolyline ? decodePolyline(route.polyline.encodedPolyline) : [],
  };
};
