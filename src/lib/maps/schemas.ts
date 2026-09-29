import { z } from '@/lib/zod';

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const locationSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  // One per search session (typing → choosing a result), per Mapbox billing.
  sessionToken: z.string().uuid(),
  // Biases results toward, e.g., the pickup when searching for the delivery.
  proximity: coordinatesSchema.optional(),
});

export const locationRetrieveSchema = z.object({
  id: z.string().min(1).max(512),
  sessionToken: z.string().uuid(),
});

export const reverseGeocodeSchema = coordinatesSchema;

export const routeRequestSchema = z.object({
  origin: coordinatesSchema,
  destination: coordinatesSchema,
});

export type LocationSearchInput = z.infer<typeof locationSearchSchema>;
export type LocationRetrieveInput = z.infer<typeof locationRetrieveSchema>;
export type RouteRequestInput = z.infer<typeof routeRequestSchema>;
