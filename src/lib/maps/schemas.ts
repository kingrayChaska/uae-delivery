import { z } from '@/lib/zod';
import { LOCATION_SOURCES, MAPS_LANGUAGES } from '@/lib/maps/types';

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// The page's language: Google describes places in it. Search text itself is
// sent as typed (Arabic or English) — never translated first.
const languageSchema = z.enum(MAPS_LANGUAGES).default('en');

export const locationSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  // One per search session (typing → choosing a result), per Google billing.
  sessionToken: z.string().uuid(),
  // Biases results toward, e.g., the pickup when searching for the delivery.
  proximity: coordinatesSchema.optional(),
  language: languageSchema,
});

export const locationRetrieveSchema = z.object({
  // A Google Place ID.
  id: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/),
  sessionToken: z.string().uuid(),
  language: languageSchema,
});

export const reverseGeocodeSchema = coordinatesSchema.extend({ language: languageSchema });

// The selected place travels with its coordinates so the quote routes it the
// same way the booking will (lib/maps/delivery-route.ts re-checks it).
const routeEndpointSchema = coordinatesSchema.extend({
  placeId: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).nullable().optional(),
  source: z.enum(LOCATION_SOURCES).nullable().optional(),
});

export const routeRequestSchema = z.object({
  origin: routeEndpointSchema,
  destination: routeEndpointSchema,
});

export type LocationSearchInput = z.input<typeof locationSearchSchema>;
export type LocationRetrieveInput = z.input<typeof locationRetrieveSchema>;
export type ReverseGeocodeInput = z.input<typeof reverseGeocodeSchema>;
export type RouteRequestInput = z.infer<typeof routeRequestSchema>;
