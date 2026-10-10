import { z } from "@/lib/zod";

import { MAX_COD_AMOUNT } from "@/lib/pricing/config";
import {
  DELIVERY_TYPES,
  PACKAGE_TYPES,
  PAYMENT_METHODS,
  RECIPIENT_PAYMENT_TYPES,
} from "@/lib/types";
import { LOCATION_SOURCES } from "@/lib/maps/types";
import { BOOKING_ERRORS, validateBookingLocations } from "@/lib/shipment/booking-guards";

import { msg, ref } from "@/i18n/message";

import type { Path } from "react-hook-form";

export const trackingLookupSchema = z.object({
  trackingNumber: z
    .string()
    .trim()
    .min(1, "tracking.errors.required")
    .max(40, "tracking.errors.tooLong"),
});

export type TrackingLookupInput = z.infer<typeof trackingLookupSchema>;

// Tracking IDs are case-insensitive; spaces people add when copying from a
// label or message are ignored too.
export const normalizeTrackingCode = (value: string) =>
  value.replace(/\s+/g, "").toUpperCase();

// ── Booking flow ─────────────────────────────────────────────────────────────
// lat/lng are only ever set by the location picker (a search result, a
// dropped pin or the device's location), never typed, so a missing value
// means no location was chosen. The coordinates are the delivery location;
// the address text and details describe it for people.
// Messages are translation keys (booking.validation.*), shown in the
// reader's language by FieldError.
const optionalText = (max: number, tooLong: string) =>
  z.string().trim().max(max, msg(tooLong, { max })).optional();

const placeText = z.string().trim().max(200).nullable().optional();

export const locationPlaceSchema = z.object({
  source: z.enum(LOCATION_SOURCES),
  // Google Place ID of the chosen place (or of the address nearest a pin).
  placeId: z.string().trim().max(512).nullable().optional(),
  name: placeText,
  street: placeText,
  neighborhood: placeText,
  district: placeText,
  city: placeText,
  region: placeText,
  regionCode: z.string().trim().max(10).nullable().optional(),
  postcode: placeText,
  country: placeText,
  countryCode: z.string().trim().max(2).nullable().optional(),
});

export type LocationPlaceInput = z.infer<typeof locationPlaceSchema>;

export const bookingLocationSchema = z.object({
  address: z
    .string()
    .trim()
    .min(1, "booking.validation.chooseLocation")
    .max(300, "booking.validation.addressTooLong"),
  lat: z.number({ error: "booking.validation.chooseLocationHow" }),
  lng: z.number({ error: "booking.validation.chooseLocationHow" }),
  place: locationPlaceSchema.optional(),
  building: optionalText(120, "booking.validation.buildingTooLong"),
  unit: optionalText(60, "booking.validation.unitTooLong"),
  floor: optionalText(20, "booking.validation.floorTooLong"),
  instructions: optionalText(500, "booking.validation.instructionsTooLong"),
  contactName: z
    .string()
    .trim()
    .min(2, "booking.validation.contactName")
    .max(120, "booking.validation.contactNameTooLong"),
  contactPhone: z
    .string()
    .trim()
    .min(7, "booking.validation.phone")
    .max(25, "booking.validation.phone")
    .regex(/^[+\d][\d\s()-]*$/, "booking.validation.phone"),
});

export type BookingLocationInput = z.infer<typeof bookingLocationSchema>;

const hasAtMostTwoDecimals = (value: number) =>
  Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

const optionalMeasure = (
  field: "weight" | "length" | "width" | "height",
  max: number,
) => {
  const name = ref(`booking.validation.fields.${field}`);
  const measure = z
    .number({ error: msg("booking.validation.measureNumber", { field: name }) })
    .positive(msg("booking.validation.measurePositive", { field: name }))
    .max(max, msg("booking.validation.measureMax", { field: name, max }));
  return measure.optional();
};

const requiredMeasure = (
  field: "weight" | "length" | "width" | "height",
  max: number,
) => {
  const name = ref(`booking.validation.fields.${field}`);
  return z
    .number({ error: msg("booking.validation.measureNumber", { field: name }) })
    .positive(msg("booking.validation.measurePositive", { field: name }))
    .max(max, msg("booking.validation.measureMax", { field: name, max }));
};

// One shipment inside a booking. Package weight is required for every customer.
const bookingShipmentFields = z.object({
  pickup: bookingLocationSchema,
  dropoff: bookingLocationSchema,
  deliveryType: z.enum(DELIVERY_TYPES, {
    error: "booking.validation.deliveryType",
  }),
  packageType: z.enum(PACKAGE_TYPES),
  packageDescription: z
    .string()
    .trim()
    .min(1, "booking.validation.description")
    .max(300, "booking.validation.descriptionTooLong"),
  packageQuantity: z
    .number({ error: "booking.validation.quantity" })
    .int("booking.validation.quantityWhole")
    .min(1, "booking.validation.quantityMin")
    .max(1000, "booking.validation.quantityMax"),
  packageWeightKg: requiredMeasure("weight", 1000),
  packageLengthCm: optionalMeasure("length", 1000),
  packageWidthCm: optionalMeasure("width", 1000),
  packageHeightCm: optionalMeasure("height", 1000),
  isFragile: z.boolean(),
  packageImagePath: z.string().nullable().optional(),
  // Has the recipient already paid the sender for the goods?
  recipientPaymentType: z.enum(RECIPIENT_PAYMENT_TYPES, {
    error: "booking.validation.recipientPaid",
  }),
  // Amount the driver collects from the recipient — never the delivery fee.
  codAmount: z.number({ error: "booking.validation.codAmount" }).optional(),
  productValue: z
    .number({ error: "booking.validation.productValue" })
    .min(0, "booking.validation.productValueNegative")
    .max(1000000, "booking.validation.productValueTooLarge")
    .optional(),
  // One id per shipment per booking attempt, reused on retries (migration 0019).
  clientRequestId: z.string().uuid().optional(),
});

const refineCod = <
  T extends { recipientPaymentType: string; codAmount?: number },
>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  if (value.recipientPaymentType === "prepaid") {
    if (value.codAmount) {
      ctx.addIssue({
        code: "custom",
        path: ["codAmount"],
        message: "booking.validation.prepaidNothing",
      });
    }
    return;
  }
  if (
    value.codAmount === undefined ||
    !Number.isFinite(value.codAmount) ||
    value.codAmount <= 0
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["codAmount"],
      message: "booking.validation.codRequired",
    });
  } else if (value.codAmount > MAX_COD_AMOUNT) {
    ctx.addIssue({
      code: "custom",
      path: ["codAmount"],
      message: msg("booking.validation.codMax", { max: MAX_COD_AMOUNT }),
    });
  } else if (!hasAtMostTwoDecimals(value.codAmount)) {
    ctx.addIssue({
      code: "custom",
      path: ["codAmount"],
      message: "booking.validation.twoDecimals",
    });
  }
};

const refineBookingLocations = (
  value: {
    pickup: { lat: number; lng: number };
    dropoff: { lat: number; lng: number };
  },
  ctx: z.RefinementCtx,
) => {
  if (
    validateBookingLocations(value.pickup, value.dropoff) ===
    BOOKING_ERRORS.sameLocation
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["dropoff", "lat"],
      message: BOOKING_ERRORS.sameLocation,
    });
  }
};

export const bookingShipmentSchema = bookingShipmentFields
  .superRefine(refineCod)
  .superRefine(refineBookingLocations);

export type BookingShipmentInput = z.infer<typeof bookingShipmentFields>;

// A single shipment plus how its delivery fee is paid — what
// createShipment() books (also used by the staff CSV upload).
export const bookingSchema = bookingShipmentFields
  .extend({ paymentMethod: z.enum(PAYMENT_METHODS) })
  .superRefine(refineCod)
  .superRefine(refineBookingLocations);

export type BookingInput = z.infer<typeof bookingSchema>;

export const MAX_SHIPMENTS_PER_BOOKING = 20;

// Everything submitted from the booking wizard at once: one or more
// shipments and a single delivery-fee payment method for all of them.
export const multiBookingSchema = z.object({
  shipments: z
    .array(bookingShipmentSchema)
    .min(1, "booking.validation.atLeastOne")
    .max(
      MAX_SHIPMENTS_PER_BOOKING,
      msg("booking.validation.tooMany", { max: MAX_SHIPMENTS_PER_BOOKING }),
    ),
  paymentMethod: z.enum(PAYMENT_METHODS),
  // Identifies the booking attempt (the batch, for multi-shipment bookings).
  clientRequestId: z.string().uuid(),
});

export type MultiBookingInput = z.infer<typeof multiBookingSchema>;

// The customer behind a booking staff take for someone with no ParcelLink
// account (WhatsApp, phone, walk-in). Same rules as a contact on the booking.
export const guestCustomerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "booking.validation.guestName")
    .max(120, "booking.validation.contactNameTooLong"),
  phone: bookingLocationSchema.shape.contactPhone,
});

export type GuestCustomerInput = z.infer<typeof guestCustomerSchema>;

// Per-step field subsets, used to validate only the current step before
// letting the wizard advance (react-hook-form's trigger(fields)).
export const BOOKING_STEP_FIELDS: Record<string, Path<BookingShipmentInput>[]> =
  {
    pickup: [
      "pickup.address",
      "pickup.lat",
      "pickup.lng",
      "pickup.building",
      "pickup.unit",
      "pickup.floor",
      "pickup.instructions",
      "pickup.contactName",
      "pickup.contactPhone",
    ],
    dropoff: [
      "dropoff.address",
      "dropoff.lat",
      "dropoff.lng",
      "dropoff.building",
      "dropoff.unit",
      "dropoff.floor",
      "dropoff.instructions",
      "dropoff.contactName",
      "dropoff.contactPhone",
    ],
    package: [
      "deliveryType",
      "packageType",
      "packageDescription",
      "packageQuantity",
      "packageWeightKg",
      "packageLengthCm",
      "packageWidthCm",
      "packageHeightCm",
      "isFragile",
      "recipientPaymentType",
      "codAmount",
      "productValue",
    ],
  };
