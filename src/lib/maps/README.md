# Maps (Mapbox)

## Architecture

- `mapbox-client.ts` — **pure** functions only: builds request URLs and parses Mapbox's JSON responses into this app's `GeocodeResult`/`RouteResult` types. No `fetch` calls. This is deliberate: it's what makes the logic unit-testable without hitting the network (see `mapbox-client.test.ts`, 13 tests covering URL construction, UAE bounding-box bias, `full_address` fallback, meters→km/seconds→minutes conversion, and Mapbox's "no route found" case).
- `mapbox-provider.ts` — composes `mapbox-client.ts` with real `fetch` calls, using `MAPBOX_SECRET_TOKEN`. Implements the `MapsProvider` interface from `lib/maps/types.ts` (Phase 1). Server-only.
- `actions.ts` — server actions (`searchAddressAction`, `getRouteAction`) that client components call. The secret token never reaches the browser; the client only ever gets back parsed `GeocodeResult`/`RouteResult` data.
- `components/maps/address-autocomplete.tsx` + `lib/hooks/use-address-autocomplete.ts` — debounced (300ms, 3-char minimum) autocomplete input.
- `components/maps/route-map.tsx` — interactive `mapbox-gl` map (pickup/drop-off markers + route line), using `NEXT_PUBLIC_MAPBOX_TOKEN` client-side. This is the one place the public token is used directly in the browser, which is what it's for (Mapbox's public tokens are meant to be restricted by URL/domain in your Mapbox account, not kept secret).

## Why geocoding/autocomplete go through a server action instead of calling Mapbox directly from the browser

Two reasons: it keeps `MAPBOX_SECRET_TOKEN` server-only (per `.env.example`'s split between the public map-rendering token and the secret geocoding/routing token), and it means UAE bounding-box bias and the `country=ae` filter are enforced in one place server-side rather than duplicated in every client call site.

## Testing without live Mapbox access

`api.mapbox.com` may not be reachable from every environment this gets built in (it wasn't from the sandbox this was built in). The pure-function split above means the request/response *logic* is fully verified by `npm test` regardless. What it can't verify without a real token and a real deployment:

- That Mapbox's actual response shape still matches the fixtures in `mapbox-client.test.ts` (Mapbox's v6 Geocoding and v5 Directions APIs are stable, documented, versioned APIs, but this is worth a real smoke test once you have credentials).
- The `/dev/maps-demo` page end-to-end (autocomplete → route → price).

**Before relying on this in production:** set `NEXT_PUBLIC_MAPBOX_TOKEN` and `MAPBOX_SECRET_TOKEN` in `.env.local` and try the real booking flow at `/dashboard/customer/book` (Phase 7) — search a real UAE address for pickup and drop-off, confirm the route line and price look right.
