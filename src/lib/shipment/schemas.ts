import { z } from '@/lib/zod';

import { MAX_COD_AMOUNT } from '@/lib/pricing/config';
import { DELIVERY_TYPES, PACKAGE_TYPES, PAYMENT_METHODS, RECIPIENT_PAYMENT_TYPES } from '@/lib/types';
import { LOCATION_SOURCES } from '@/lib/maps/types';

import type { Path } from 'react-hook-form';

export const trackingLookupSchema = z.object({
  trackingNumber: z
    .string()
    .trim()
    .min(1, 'Enter a tracking ID')
    .max(40, 'That doesn’t look like a tracking ID'),
});

export type TrackingLookupInput = z.infer<typeof trackingLookupSchema>;

// Tracking IDs are case-insensitive; spaces people add when copying from a
// label or message are ignored too.
export const normalizeTrackingCode = (value: string) => value.replace(/\s+/g, '').toUpperCase();

// ── Booking flow ─────────────────────────────────────────────────────────────
// lat/lng are only ever set by the location picker (a search result, a
// dropped pin or the device's location), never typed, so a missing value
// means no location was chosen. The coordinates are the delivery location;
// the address text and details describe it for people.
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep the ${label} under ${max} characters`)
    .optional();

const placeText = z.string().trim().max(200).nullable().optional();

export const locationPlaceSchema = z.object({
  source: z.enum(LOCATION_SOURCES),
  name: placeText,
  street: placeText,
  neighborhood: placeText,
  district: placeText,
  city: placeText,
  region: placeText,
  regionCode: z.string().trim().max(10).nullable().optional(),
  postcode: placeText,
  country: placeText,
});

export type LocationPlaceInput = z.infer<typeof locationPlaceSchema>;

export const bookingLocationSchema = z.object({
  address: z.string().trim().min(1, 'Choose a location').max(300, 'That address is too long'),
  lat: z.number({ error: 'Choose a location — search, drop a pin or use your current location' }),
  lng: z.number({ error: 'Choose a location — search, drop a pin or use your current location' }),
  place: locationPlaceSchema.optional(),
  building: optionalText(120, 'building / villa'),
  unit: optionalText(60, 'apartment / unit'),
  floor: optionalText(20, 'floor'),
  instructions: optionalText(500, 'instructions'),
  contactName: z.string().trim().min(2, 'Enter a contact name').max(120, 'Keep the name under 120 characters'),
  contactPhone: z
    .string()
    .trim()
    .min(7, 'Enter a valid phone number')
    .max(25, 'Enter a valid phone number')
    .regex(/^[+\d][\d\s()-]*$/, 'Enter a valid phone number'),
});

export type BookingLocationInput = z.infer<typeof bookingLocationSchema>;

const hasAtMostTwoDecimals = (value: number) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

const optionalMeasure = (label: string, max: number) =>
  z
    .number({ error: `Enter the ${label} as a number` })
    .positive(`${label[0].toUpperCase()}${label.slice(1)} must be more than 0`)
    .max(max, `${label[0].toUpperCase()}${label.slice(1)} must be ${max} or less`)
    .optional();

// One shipment inside a booking. Weight is optional here because it's only
// compulsory for merchants — createShipment() enforces that against the
// customer's real account type, and so does the database.
const bookingShipmentFields = z.object({
  pickup: bookingLocationSchema,
  dropoff: bookingLocationSchema,
  deliveryType: z.enum(DELIVERY_TYPES, { error: 'Choose same-day or next-day delivery' }),
  packageType: z.enum(PACKAGE_TYPES),
  packageDescription: z.string().trim().min(1, 'Describe what you are sending').max(300, 'Keep the description under 300 characters'),
  packageQuantity: z
    .number({ error: 'Enter a quantity' })
    .int('Enter a whole number')
    .min(1, 'At least 1')
    .max(1000, 'At most 1000 items per shipment'),
  packageWeightKg: optionalMeasure('weight', 1000),
  packageLengthCm: optionalMeasure('length', 1000),
  packageWidthCm: optionalMeasure('width', 1000),
  packageHeightCm: optionalMeasure('height', 1000),
  isFragile: z.boolean(),
  packageImagePath: z.string().nullable().optional(),
  // Has the recipient already paid the sender for the goods?
  recipientPaymentType: z.enum(RECIPIENT_PAYMENT_TYPES, { error: 'Choose whether the recipient has paid' }),
  // Amount the driver collects from the recipient — never the delivery fee.
  codAmount: z.number({ error: 'Enter the amount to collect' }).optional(),
  productValue: z
    .number({ error: 'Enter the product value as a number' })
    .min(0, 'Product value can’t be negative')
    .max(1000000, 'Product value is too large')
    .optional(),
  // One id per shipment per booking attempt, reused on retries (migration 0019).
  clientRequestId: z.string().uuid().optional(),
});

const refineCod = <T extends { recipientPaymentType: string; codAmount?: number }>(value: T, ctx: z.RefinementCtx) => {
  if (value.recipientPaymentType === 'prepaid') {
    if (value.codAmount) {
      ctx.addIssue({ code: 'custom', path: ['codAmount'], message: 'Prepaid shipments have nothing to collect' });
    }
    return;
  }
  if (value.codAmount === undefined || !Number.isFinite(value.codAmount) || value.codAmount <= 0) {
    ctx.addIssue({ code: 'custom', path: ['codAmount'], message: 'Enter the amount to collect from the recipient' });
  } else if (value.codAmount > MAX_COD_AMOUNT) {
    ctx.addIssue({
      code: 'custom',
      path: ['codAmount'],
      message: `The collection amount can be at most AED ${MAX_COD_AMOUNT.toLocaleString('en')}`,
    });
  } else if (!hasAtMostTwoDecimals(value.codAmount)) {
    ctx.addIssue({ code: 'custom', path: ['codAmount'], message: 'Use at most 2 decimal places' });
  }
};

export const bookingShipmentSchema = bookingShipmentFields.superRefine(refineCod);

export type BookingShipmentInput = z.infer<typeof bookingShipmentFields>;

// A single shipment plus how its delivery fee is paid — what
// createShipment() books (also used by the staff CSV upload).
export const bookingSchema = bookingShipmentFields
  .extend({ paymentMethod: z.enum(PAYMENT_METHODS) })
  .superRefine(refineCod);

export type BookingInput = z.infer<typeof bookingSchema>;

export const MAX_SHIPMENTS_PER_BOOKING = 20;

// Everything submitted from the booking wizard at once: one or more
// shipments and a single delivery-fee payment method for all of them.
export const multiBookingSchema = z.object({
  shipments: z
    .array(bookingShipmentSchema)
    .min(1, 'Add at least one shipment')
    .max(MAX_SHIPMENTS_PER_BOOKING, `A booking can hold at most ${MAX_SHIPMENTS_PER_BOOKING} shipments`),
  paymentMethod: z.enum(PAYMENT_METHODS),
  // Identifies the booking attempt (the batch, for multi-shipment bookings).
  clientRequestId: z.string().uuid(),
});

export type MultiBookingInput = z.infer<typeof multiBookingSchema>;

// Per-step field subsets, used to validate only the current step before
// letting the wizard advance (react-hook-form's trigger(fields)).
export const BOOKING_STEP_FIELDS: Record<string, Path<BookingShipmentInput>[]> = {
  pickup: [
    'pickup.address',
    'pickup.lat',
    'pickup.lng',
    'pickup.building',
    'pickup.unit',
    'pickup.floor',
    'pickup.instructions',
    'pickup.contactName',
    'pickup.contactPhone',
  ],
  dropoff: [
    'dropoff.address',
    'dropoff.lat',
    'dropoff.lng',
    'dropoff.building',
    'dropoff.unit',
    'dropoff.floor',
    'dropoff.instructions',
    'dropoff.contactName',
    'dropoff.contactPhone',
  ],
  package: [
    'deliveryType',
    'packageType',
    'packageDescription',
    'packageQuantity',
    'packageWeightKg',
    'packageLengthCm',
    'packageWidthCm',
    'packageHeightCm',
    'isFragile',
    'recipientPaymentType',
    'codAmount',
    'productValue',
  ],
};
