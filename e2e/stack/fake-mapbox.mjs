// Deterministic stand-in for the Mapbox Geocoding v6 and Directions v5 APIs,
// returning the same response shapes the real APIs do (the shapes the unit
// tests in src/lib/maps/mapbox-client.test.ts are written against).
// Road distance is modelled as 1.3x straight-line — real routes are longer
// than the crow flies, which is exactly why pricing must never use
// straight-line distance.
import http from 'node:http';

const PLACES = [
  { name: 'Dubai Marina Mall', place: 'Dubai Marina, Dubai, United Arab Emirates', lat: 25.0768, lng: 55.1398 },
  { name: 'Mall of the Emirates', place: 'Al Barsha, Dubai, United Arab Emirates', lat: 25.1181, lng: 55.2006 },
  { name: 'Burj Khalifa', place: 'Downtown Dubai, Dubai, United Arab Emirates', lat: 25.1972, lng: 55.2744 },
  { name: 'Jumeirah Beach Residence', place: 'JBR, Dubai, United Arab Emirates', lat: 25.0784, lng: 55.1336 },
  { name: 'Dubai International Airport', place: 'Al Garhoud, Dubai, United Arab Emirates', lat: 25.2532, lng: 55.3657 },
  { name: 'Abu Dhabi Corniche', place: 'Al Khalidiyah, Abu Dhabi, United Arab Emirates', lat: 24.4764, lng: 54.3348 },
];

const toRad = (d) => (d * Math.PI) / 180;
const haversineKm = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const feature = (p) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
  properties: { name: p.name, place_formatted: p.place, full_address: `${p.name}, ${p.place}` },
});

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.searchParams.get('access_token')) return json(res, 401, { message: 'Not Authorized - No Token' });

    if (url.pathname.endsWith('/search/geocode/v6/forward')) {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const limit = Number(url.searchParams.get('limit') ?? 5);
      const hits = PLACES.filter((p) => `${p.name} ${p.place}`.toLowerCase().includes(q)).slice(0, limit);
      return json(res, 200, { type: 'FeatureCollection', features: hits.map(feature) });
    }

    const directions = url.pathname.match(/\/directions\/v5\/mapbox\/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)$/);
    if (directions) {
      const [, lng1, lat1, lng2, lat2] = directions.map(Number);
      const km = haversineKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }) * 1.3;
      return json(res, 200, {
        code: 'Ok',
        routes: [
          {
            distance: km * 1000,
            duration: (km / 40) * 3600,
            geometry: { type: 'LineString', coordinates: [[lng1, lat1], [lng2, lat2]] },
          },
        ],
      });
    }
    return json(res, 404, { message: 'Not Found' });
  })
  .listen(Number(process.env.E2E_MAPBOX_PORT), '127.0.0.1');
