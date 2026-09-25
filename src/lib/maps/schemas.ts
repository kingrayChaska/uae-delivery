import { z } from '@/lib/zod';

export const addressSearchSchema = z.object({
  query: z.string().min(1),
});

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const routeRequestSchema = z.object({
  origin: coordinatesSchema,
  destination: coordinatesSchema,
});

export type AddressSearchInput = z.infer<typeof addressSearchSchema>;
export type RouteRequestInput = z.infer<typeof routeRequestSchema>;
