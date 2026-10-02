// Deterministic stand-in for the Google Maps Platform web services the
// server calls — Places API (New) Autocomplete, Place Details and Text
// Search, the Geocoding API (forward + reverse) and the Routes API —
// returning the same response shapes the real APIs do (the shapes the unit
// tests in src/lib/maps/google-client.test.ts are written against).
// Road distance is modelled as 1.3x straight-line — real routes are longer
// than the crow flies, which is exactly why pricing must never use
// straight-line distance.
import http from 'node:http';

const PLACES = [
  { id: 'fake-marina-mall', name: 'Dubai Marina Mall', area: 'Dubai Marina', emirate: 'Dubai', lat: 25.0768, lng: 55.1398 },
  { id: 'fake-moe', name: 'Mall of the Emirates', area: 'Al Barsha', emirate: 'Dubai', lat: 25.1181, lng: 55.2006 },
  { id: 'fake-burj', name: 'Burj Khalifa', area: 'Downtown Dubai', emirate: 'Dubai', lat: 25.1972, lng: 55.2744 },
  { id: 'fake-jbr', name: 'Jumeirah Beach Residence', area: 'JBR', emirate: 'Dubai', lat: 25.0784, lng: 55.1336 },
  { id: 'fake-dxb', name: 'Dubai International Airport', area: 'Al Garhoud', emirate: 'Dubai', lat: 25.2532, lng: 55.3657 },
  { id: 'fake-corniche', name: 'Abu Dhabi Corniche', area: 'Al Khalidiyah', emirate: 'Abu Dhabi', lat: 24.4764, lng: 54.3348 },
];

const toRad = (d) => (d * Math.PI) / 180;
const haversineKm = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Google's encoded polyline format (precision 5).
const encodePolyline = (points) => {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const encode = (value) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const { lat, lng } of points) {
    const [la, ln] = [Math.round(lat * 1e5), Math.round(lng * 1e5)];
    encode(la - prevLat);
    encode(ln - prevLng);
    [prevLat, prevLng] = [la, ln];
  }
  return out;
};

const formatted = (p) => `${p.name} - ${p.area} - ${p.emirate} - United Arab Emirates`;

// The app decides which emirate a point is in from administrative_area_level_1.
const components = (p) => [
  { longText: p.area, shortText: p.area, types: ['sublocality_level_1', 'sublocality', 'political'] },
  { longText: p.emirate, shortText: p.emirate, types: ['locality', 'political'] },
  { longText: p.emirate, shortText: p.emirate, types: ['administrative_area_level_1', 'political'] },
  { longText: 'United Arab Emirates', shortText: 'AE', types: ['country', 'political'] },
];

const place = (p) => ({
  id: p.id,
  displayName: { text: p.name, languageCode: 'en' },
  formattedAddress: formatted(p),
  location: { latitude: p.lat, longitude: p.lng },
  addressComponents: components(p),
  types: ['point_of_interest', 'establishment'],
});

const geocodingResult = (p) => ({
  place_id: p.id,
  formatted_address: formatted(p),
  geometry: { location: { lat: p.lat, lng: p.lng } },
  types: ['establishment', 'point_of_interest'],
  address_components: components(p).map((c) => ({ long_name: c.longText, short_name: c.shortText, types: c.types })),
});

const matches = (query) => {
  const q = query.toLowerCase();
  return PLACES.filter((p) => `${p.name} ${p.area} ${p.emirate}`.toLowerCase().includes(q));
};

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });

const denied = { error: { code: 403, message: 'The request is missing a valid API key.', status: 'PERMISSION_DENIED' } };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') return json(res, 200, { ok: true });

    // Geocoding API: key in the query string, HTTP 200 with a status field.
    if (url.pathname === '/maps/api/geocode/json') {
      if (!url.searchParams.get('key')) return json(res, 200, { status: 'REQUEST_DENIED', error_message: 'No API key', results: [] });
      const latlng = url.searchParams.get('latlng');
      if (latlng) {
        // The nearest known place within 30 km describes the point; anywhere
        // else (the sea, another country) has no address, like the real API.
        const [lat, lng] = latlng.split(',').map(Number);
        const nearest = PLACES.map((p) => ({ p, km: haversineKm({ lat, lng }, p) })).sort((a, b) => a.km - b.km)[0];
        const results = nearest && nearest.km <= 30 ? [geocodingResult(nearest.p)] : [];
        return json(res, 200, { status: results.length ? 'OK' : 'ZERO_RESULTS', results });
      }
      const [first] = matches(url.searchParams.get('address') ?? '');
      return json(res, 200, first ? { status: 'OK', results: [geocodingResult(first)] } : { status: 'ZERO_RESULTS', results: [] });
    }

    // Places (New) and Routes: key in the X-Goog-Api-Key header.
    if (!req.headers['x-goog-api-key']) return json(res, 403, denied);

    if (req.method === 'POST' && url.pathname === '/v1/places:autocomplete') {
      const { input = '' } = await readBody(req);
      const suggestions = matches(input)
        .slice(0, 5)
        .map((p) => ({
          placePrediction: {
            placeId: p.id,
            text: { text: formatted(p) },
            structuredFormat: { mainText: { text: p.name }, secondaryText: { text: `${p.area} - ${p.emirate} - United Arab Emirates` } },
            types: ['point_of_interest', 'establishment'],
          },
        }));
      return json(res, 200, suggestions.length ? { suggestions } : {});
    }

    if (req.method === 'POST' && url.pathname === '/v1/places:searchText') {
      const { textQuery = '', pageSize = 20 } = await readBody(req);
      const places = matches(textQuery).slice(0, pageSize).map(place);
      return json(res, 200, places.length ? { places } : {});
    }

    const details = url.pathname.match(/^\/v1\/places\/([A-Za-z0-9_-]+)$/);
    if (req.method === 'GET' && details) {
      const found = PLACES.find((p) => p.id === details[1]);
      return found ? json(res, 200, place(found)) : json(res, 404, { error: { code: 404, status: 'NOT_FOUND', message: 'Not found' } });
    }

    if (req.method === 'POST' && url.pathname === '/directions/v2:computeRoutes') {
      const body = await readBody(req);
      // A waypoint is a selected place (placeId) or exact coordinates.
      const point = (waypoint) => {
        if (waypoint.placeId) {
          const p = PLACES.find((candidate) => candidate.id === waypoint.placeId);
          return p ? { lat: p.lat, lng: p.lng } : null;
        }
        return { lat: waypoint.location.latLng.latitude, lng: waypoint.location.latLng.longitude };
      };
      const from = point(body.origin);
      const to = point(body.destination);
      if (!from || !to) return json(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unknown place' } });
      const km = haversineKm(from, to) * 1.3;
      return json(res, 200, {
        routes: [
          {
            // Unrounded (the real API sends whole metres) so e2e/helpers.ts's
            // independent price calculation matches to the fil.
            distanceMeters: km * 1000,
            duration: `${Math.round((km / 40) * 3600)}s`,
            polyline: { encodedPolyline: encodePolyline([from, to]) },
          },
        ],
      });
    }

    return json(res, 404, { error: { code: 404, status: 'NOT_FOUND', message: 'Not found' } });
  })
  .listen(Number(process.env.E2E_GOOGLE_MAPS_PORT), '127.0.0.1');
