# Maps (Google Maps Platform)

## Architecture

- `google-client.ts` — **pure** functions only: builds Google API requests and parses Google's JSON into this app's types. No `fetch` calls, so it's unit-tested without the network (`google-client.test.ts`).
- `google-provider.ts` — composes `google-client.ts` with real `fetch` calls using `GOOGLE_MAPS_SERVER_API_KEY`. Server-only. Caches routes for an hour (the wizard's quote and the booking's own check ask for the same one).
- `actions.ts` — server actions the browser calls: `searchLocationsAction`, `retrieveLocationAction`, `reverseGeocodeAction`, `getRouteAction`. Each requires a signed-in user and is rate limited. Google's error text goes to server logs; customers see the app's own messages.
- `google-maps-loader.ts` + `use-google-map.ts` — load the Maps JavaScript API once per page (only the `maps` and `marker` libraries, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`), and create a map that follows the app's light/dark theme. A refused key (`gm_authFailure`) or a failed script shows the app's "map unavailable" message instead of Google's grey box.
- `components/maps/location-picker.tsx` — the pickup/delivery picker: search, "Use my current location", "Drop a pin on the map", and a confirmation card. `lib/hooks/use-location-search.ts` debounces (300 ms, 3 characters), drops stale responses, caches repeated queries, and manages the Places session token.
- `components/maps/map-location-selector.tsx` — the draggable-pin map: drag the pin, tap anywhere (including a business/landmark icon), or "Put pin at map centre".
- `components/maps/route-map.tsx` — pickup (A) and delivery (B) pins and the driving route, framed to fit both. In the booking wizard the pins are draggable; the moved end is reverse-geocoded and the route and price are recalculated.
- `components/operator/dispatch-map.tsx` — live driver positions for dispatch and the live map.

## Which Google APIs, and why

| API | Used for | Where |
| --- | --- | --- |
| **Maps JavaScript API** | Drawing maps, Advanced Markers, route lines | Browser (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) |
| **Places API (New)** — Autocomplete | Search-as-you-type: businesses, buildings, landmarks, parks, streets, communities, districts | Server |
| **Places API (New)** — Place Details | Coordinates, address parts and Place ID of the chosen suggestion (ends the billing session) | Server |
| **Places API (New)** — Text Search | Fallback when Autocomplete returns nothing or fails (more forgiving of partial/descriptive queries); staff CSV fallback | Server |
| **Geocoding API** | Reverse geocoding (dropped pins, current location, the server's emirate check); forward geocoding for the staff CSV upload | Server |
| **Routes API** — `computeRoutes` | Driving distance, duration and path. Pricing and the distance limit use only this | Server |

Nothing else needs enabling. Legacy Places, Directions and Distance Matrix are not used.

**Search coverage.** Autocomplete has no type filter, so every kind of place Google indexes can come back. Results are restricted to the UAE (`includedRegionCodes: ['ae']`) and biased toward the other end of the trip (50 km circle) or, before that's known, the whole UAE. Queries are sent exactly as typed — Arabic or English — and Google answers in the page's language (`languageCode`). Autocomplete returns at most five predictions; if it has none, Text Search runs. If Google still has nothing, the dropdown's "Drop a pin on the map" is always there.

**Exact pins as the fallback.** A dropped pin or device location keeps its **exact** coordinates even when reverse geocoding fails; the customer then types building/unit details. Google never has to know an address for a booking to go through.

**Session tokens.** One UUID per search: every Autocomplete keystroke request and the Place Details call that ends it share the token, which Google bills as one session. A new token starts after each selection.

**Routes are traffic-unaware** (`TRAFFIC_UNAWARE`). The wizard's price and the server's price at booking time are computed minutes apart; a traffic-aware route could change in between and the booking would be priced differently from the quote. The duration shown is Google's typical drive time for that route.

**Map language.** The Maps JavaScript API fixes its language when it loads. After switching language, map labels and Google's own controls stay in the first language until the next full page load; everything ParcelLink draws (search results, addresses, messages) switches immediately. The switcher doesn't force a reload because that would discard a half-completed booking.

## Stored data

`pickup_address`/`pickup_lat`/`pickup_lng` (and `dropoff_*`) remain the source of truth. The Google Place ID is stored as `placeId` inside the existing `pickup_place`/`dropoff_place` jsonb (migration 0025), so no schema change was needed and older (Mapbox-era) rows stay readable as they were.

## Service areas (which emirates can be booked)

`lib/service-areas/config.ts` is the one place coverage lives: `EMIRATE_COVERAGE` maps each emirate to `active` (Dubai, Sharjah, Ajman) or `contact_support` (Abu Dhabi, Ras Al Khaimah, Fujairah, Umm Al Quwain). The emirate is the boundary; there is no neighbourhood list. `classifyServiceArea` gives one of four verdicts, for pickup and delivery alike: `active`, `contact_support`, `unverified` (a UAE location whose emirate couldn't be confirmed — support confirms it) or `outside_uae`. Only `active` continues to pricing, booking and payment.

- **Which emirate?** From Google's address components, never the typed text or formatted address: the country (`AE`, else outside the UAE), then `administrative_area_level_1`, then — since Google often gives UAE places only a city — `locality` (the city of Dubai is in Dubai; towns like Hatta or Khor Fakkan are listed per emirate), then the ISO code on older bookings. English and Arabic spellings, "Emirate"/"إمارة", case, spacing, punctuation and Arabic letter variants are normalised.
- **In the booking wizard:** instant when the selected place names its emirate; otherwise the server is asked straight away (`checkLocationCoverageAction`) and the step shows "Checking delivery availability…" — a location is never turned away because the browser lacked a detail.
- **On the server (the real check):** `quoteShipment` calls `requireServiceableTrip` (`lib/service-areas/verify.ts`) for both ends independently. It re-fetches the **selected Google place** by its Place ID and uses its components, provided the place is within 2 km of the booking's coordinates; otherwise it reverse-geocodes the coordinates. It never trusts the place details the browser sent. A failed lookup is `unverified` (fails closed). Every booking path goes through it.

## Testing

- `npm test` covers the request/response logic against Google's documented response shapes.
- The end-to-end suite runs against `e2e/stack/fake-google-maps.mjs`, pointed to with `GOOGLE_MAPS_API_URL` (unset in real deployments).
- With real keys, run the booking flow at `/dashboard/customer/book` and check the browser console for Google Maps or CSP errors — see the checklist in SECURITY.md.
