import { z } from '@/lib/zod';

import { SHIPMENT_STATUSES } from '@/lib/types';

import type { Shipment, ShipmentStatus } from '@/lib/types';

// Operators and managers changing a booked shipment's price and cancelling
// a shipment (migration 0046). staff_adjust_shipment_price() and
// staff_cancel_shipment() are the rule; this mirrors the parts a form needs
// before asking the server, and the database re-checks all of it.

// The delivery service charge an operator may set, in AED.
export const MAX_SERVICE_CHARGE = 10_000;

// Statuses the database lets operations cancel. Once picked up, the parcel
// is with the driver and is returned to the sender instead.
export const STAFF_CANCELLABLE: readonly ShipmentStatus[] = [
  'pending_payment',
  'confirmed',
  'assigned',
  'driver_accepted',
  'arrived_pickup',
];

// Why an action isn't available (shipment_staff_actions(), 0046).
export type PriceEditBlock = 'closed' | 'fee_paid' | 'fee_collected' | 'on_statement';
export type CancelBlock = 'picked_up' | 'delivery_failed' | 'delivered' | 'returned' | 'cancelled';

export type StaffActionContext = {
  priceEditBlock: PriceEditBlock | null;
  cancelBlock: CancelBlock | null;
  // price minus the weight and COD-handling charges: what the operator edits.
  serviceCharge: number;
  feePaid: boolean;
  // Cash the driver has already recorded collecting, and still expects to.
  cashCollected: number;
  cashExpected: number;
  invoiceNumber: string | null;
};

// The service charge is the price without its weight and COD-handling
// charges; those stay as calculated when operations changes the price.
export const fixedCharges = (shipment: Pick<Shipment, 'weightCharge' | 'codCharge'>) =>
  toFils(shipment.weightCharge ?? 0) + toFils(shipment.codCharge ?? 0);

// Money is compared and added in whole fils, never as floats.
export const toFils = (aed: number) => Math.round(aed * 100);

// The new total for a proposed service charge.
export const newTotalFor = (shipment: Pick<Shipment, 'weightCharge' | 'codCharge'>, serviceCharge: number) =>
  (toFils(serviceCharge) + fixedCharges(shipment)) / 100;

// "12", "12.5", "12.50" — digits, an optional point and at most two decimals.
// No signs, exponents, commas, "Infinity" or "NaN".
const AMOUNT_PATTERN = /^\d{1,5}(\.\d{1,2})?$/;

export const serviceChargeSchema = z
  .string()
  .trim()
  .min(1, 'operator.validation.priceRequired')
  .regex(AMOUNT_PATTERN, 'operator.validation.priceFormat')
  .transform(Number)
  .refine((value) => Number.isFinite(value) && value >= 0 && value <= MAX_SERVICE_CHARGE, 'operator.validation.priceRange');

const reasonSchema = (tooShort: string) =>
  z.string().trim().min(5, tooShort).max(500, 'operator.validation.reasonTooLong');

export const priceEditSchema = z.object({
  shipmentId: z.string().uuid(),
  // What the operator was looking at: a change made since is refused.
  expectedStatus: z.enum(SHIPMENT_STATUSES),
  expectedPrice: z.number().nonnegative(),
  serviceCharge: serviceChargeSchema,
  reason: reasonSchema('operator.validation.priceReason'),
  // One per dialog opening: a repeated submit returns the first result.
  requestId: z.string().uuid(),
});

export type PriceEditInput = z.input<typeof priceEditSchema>;

export const staffCancelSchema = z.object({
  shipmentId: z.string().uuid(),
  expectedStatus: z.enum(SHIPMENT_STATUSES),
  reason: reasonSchema('operator.validation.cancelReason'),
  requestId: z.string().uuid(),
});

export type StaffCancelInput = z.input<typeof staffCancelSchema>;

export type PriceEditResult = { price: number; voidedInvoices: string[] };
export type StaffCancelResult = { refundRequired: boolean; cashCollected: number };
