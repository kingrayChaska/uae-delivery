import { z } from '@/lib/zod';

import { PACKAGE_TYPES, PAYMENT_METHODS } from '@/lib/types';

import type { Path } from 'react-hook-form';

export const trackingLookupSchema = z.object({
  trackingNumber: z.string().min(1, 'Enter a tracking number'),
});

export type TrackingLookupInput = z.infer<typeof trackingLookupSchema>;

// ── Booking flow ─────────────────────────────────────────────────────────────
// lat/lng are only ever set via AddressAutocomplete's onSelect (never typed
// directly), so a missing value means the person typed something but never
// actually picked a suggestion from the list.
export const bookingLocationSchema = z.object({
  address: z.string().min(1, 'Select an address from the suggestions'),
  lat: z.number({ error: 'Select an address from the suggestions' }),
  lng: z.number({ error: 'Select an address from the suggestions' }),
  contactName: z.string().min(2, 'Enter a contact name'),
  contactPhone: z.string().min(7, 'Enter a valid phone number'),
});

export type BookingLocationInput = z.infer<typeof bookingLocationSchema>;

export const bookingPackageSchema = z.object({
  packageType: z.enum(PACKAGE_TYPES),
  packageDescription: z.string().min(1, 'Describe what you are sending'),
  packageQuantity: z.number({ error: 'Enter a quantity' }).int('Enter a whole number').min(1, 'At least 1'),
  packageWeightKg: z.number().min(0).optional(),
  isFragile: z.boolean(),
  packageImagePath: z.string().nullable().optional(),
});

export const bookingPaymentSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
});

export const bookingSchema = bookingPackageSchema.merge(bookingPaymentSchema).extend({
  pickup: bookingLocationSchema,
  dropoff: bookingLocationSchema,
  // One id per booking attempt, reused on retries — see migration 0019.
  clientRequestId: z.string().uuid().optional(),
});

export type BookingInput = z.infer<typeof bookingSchema>;

// Per-step field subsets, used to validate only the current step before
// letting the wizard advance (react-hook-form's trigger(fields)).
export const BOOKING_STEP_FIELDS: Record<string, Path<BookingInput>[]> = {
  pickup: ['pickup.address', 'pickup.lat', 'pickup.lng', 'pickup.contactName', 'pickup.contactPhone'],
  dropoff: ['dropoff.address', 'dropoff.lat', 'dropoff.lng', 'dropoff.contactName', 'dropoff.contactPhone'],
  package: ['packageType', 'packageDescription', 'packageQuantity', 'packageWeightKg', 'isFragile'],
  payment: ['paymentMethod'],
};
