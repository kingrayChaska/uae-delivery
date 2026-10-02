import { z } from '@/lib/zod';
import { MAPS_LANGUAGES } from '@/lib/maps/types';

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

export const routeRequestSchema = z.object({
  origin: coordinatesSchema,
  destination: coordinatesSchema,
});

export type LocationSearchInput = z.input<typeof locationSearchSchema>;
export type LocationRetrieveInput = z.input<typeof locationRetrieveSchema>;
export type ReverseGeocodeInput = z.input<typeof reverseGeocodeSchema>;
export type RouteRequestInput = z.infer<typeof routeRequestSchema>;
