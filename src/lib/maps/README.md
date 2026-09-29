# Maps (Mapbox)

## Architecture

- `mapbox-client.ts` — **pure** functions only: builds request URLs and parses Mapbox's JSON into this app's types. No `fetch` calls, so it's unit-tested without the network (`mapbox-client.test.ts`, `location-search.test.ts`).
- `mapbox-provider.ts` — composes `mapbox-client.ts` with real `fetch` calls using `MAPBOX_SECRET_TOKEN`. Server-only.
- `actions.ts` — server actions the browser calls: `searchLocationsAction`, `retrieveLocationAction`, `reverseGeocodeAction`, `getRouteAction`. Each requires a signed-in user and is rate limited.
- `components/maps/location-picker.tsx` — the pickup/delivery location picker: search, "Use my current location", "Drop a pin on the map", and a confirmation card. `lib/hooks/use-location-search.ts` debounces (300 ms, 3 characters), drops stale responses and caches repeated queries.
- `components/maps/map-location-selector.tsx` — the draggable-pin map, loaded only when a customer chooses to drop a pin.
- `components/maps/route-map.tsx` — the route preview map. The two map components are the only places the public `NEXT_PUBLIC_MAPBOX_TOKEN` is used (for tiles).

## Which Mapbox APIs, and why

- **Search Box API** (`/search/searchbox/v1/suggest` + `/retrieve`) is the primary search. The Geocoding API doesn't index points of interest, which is why towers, malls, hotels, warehouses and businesses couldn't be found. Search Box covers POIs as well as addresses, streets and neighbourhoods. Requests use `country=ae`, `language=en`, the UAE bounding box, no `types` filter, and a session token per search (Mapbox bills suggest + retrieve as one session).
- **Geocoding v6** — automatic fallback if Search Box fails (so search keeps working), reverse geocoding for dropped pins and current location, and forward geocoding for the staff CSV upload.
- **Directions v5** — road distance between the chosen coordinates. Pricing and the distance limit use only this.

A dropped pin or device location keeps its **exact** coordinates even when reverse geocoding fails; the customer then types building/unit details. Mapbox never has to know an address for a booking to go through.

## Service areas (which emirates can be booked)

`lib/service-areas/config.ts` is the one place the emirate rules live: `SERVICE_AREAS.fullySupported` (Dubai, Sharjah, Ajman) and `SERVICE_AREAS.requestOnly` (Abu Dhabi, Ras Al Khaimah, Fujairah, Umm Al Quwain). Move an emirate between the lists to change the rule.

- **Which emirate?** Taken only from the region Mapbox reports for a point: its ISO 3166-2 code (`AE-DU`, returned as `region_code_full`/`region_code` and kept as `place.regionCode`) and, failing that, the region name. City and neighbourhood names are never used to guess. Anything that can't be confirmed is `unknown` and is never treated as supported.
- **In the booking wizard:** the notice appears as soon as a location is chosen and Continue is disabled. Request-only emirates get "Delivery/Pickup available on request" naming the emirate; unknown locations get "Service area unavailable". "Contact ParcelLink" opens a support request already describing the delivery (customers) or the public contact section.
- **On the server (the real check):** `quoteShipment` calls `requireServiceableTrip` (`lib/service-areas/verify.ts`), which reverse-geocodes the booking's **coordinates** itself and ignores the place details the browser sent. A failed lookup counts as unknown (fails closed). Every booking path goes through it: customer and merchant bookings, staff booking on behalf, and the staff CSV upload. The confirmed emirate is stored as `emirate` inside `pickup_place`/`dropoff_place`.
- The database can't geocode, so it has no independent emirate check; direct inserts are still bound by the existing RLS price and distance checks.

## Why geocoding/autocomplete go through a server action instead of calling Mapbox directly from the browser

Two reasons: it keeps `MAPBOX_SECRET_TOKEN` server-only (per `.env.example`'s split between the public map-rendering token and the secret geocoding/routing token), and it means UAE bounding-box bias and the `country=ae` filter are enforced in one place server-side rather than duplicated in every client call site.

## Testing without live Mapbox access

`api.mapbox.com` may not be reachable from every environment this gets built in (it wasn't from the sandbox this was built in). The pure-function split above means the request/response *logic* is fully verified by `npm test` regardless. What it can't verify without a real token and a real deployment:

- That Mapbox's actual response shape still matches the fixtures in `mapbox-client.test.ts` (Mapbox's v6 Geocoding and v5 Directions APIs are stable, documented, versioned APIs, but this is worth a real smoke test once you have credentials).
- The `/dev/maps-demo` page end-to-end (autocomplete → route → price).

**Before relying on this in production:** set `NEXT_PUBLIC_MAPBOX_TOKEN` and `MAPBOX_SECRET_TOKEN` in `.env.local` and try the real booking flow at `/dashboard/customer/book` (Phase 7) — search a real UAE address for pickup and drop-off, confirm the route line and price look right.
