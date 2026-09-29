import type { PriceBreakdown, PricingRule, RecipientPaymentType } from '@/lib/types';

// THE pricing engine. Pure, no DB access: the active PricingRule for the
// shipment's delivery type and the customer's account type is fetched
// separately (lib/pricing/get-active-rule.ts) and passed in. The booking
// wizard's live quote, the landing-page calculator, the server-side booking
// (services/shipments/create-shipment.ts) and — as SQL —
// shipment_price_is_valid() (migration 0022) all compute exactly this:
//
//   base price                      rule.basePrice
// + distance charge                 max(distance - baseDistanceKm, 0) x perKm
// + weight charge                   max(weight - includedWeightKg, 0) x perKg
// + COD charge                      rule.codFee, only when the recipient pays on delivery
// = total
//
// Each component is rounded to fils (half up) separately, in integer
// hundredths, so it matches Postgres's exact decimal math. The price MUST
// be computed from exactly the distance and weight that get stored
// (numeric(7,2) / numeric(8,2)), because the database re-derives it from
// the stored values — pricing an unrounded 24.7639 km while storing 24.76
// once made those disagree and every booking was rejected (Phase 13).
const toHundredths = (value: number) => Math.round(value * 100);

export const billableDistanceKm = (distanceKm: number) => toHundredths(Math.max(0, distanceKm)) / 100;

// Rounded the way the numeric(8,2) weight column stores it.
export const billableWeightKg = (weightKg: number | null | undefined) =>
  weightKg == null || !Number.isFinite(weightKg) ? null : toHundredths(Math.max(0, weightKg)) / 100;

// hundredths x hundredths = ten-thousandths; +50 then integer-divide by 100
// rounds half up to fils.
const chargeFils = (excessHundredths: number, ratePerUnit: number) =>
  Math.floor((excessHundredths * toHundredths(ratePerUnit) + 50) / 100);

export type PriceInput = {
  rule: PricingRule;
  distanceKm: number;
  durationMinutes?: number;
  weightKg?: number | null;
  recipientPaymentType?: RecipientPaymentType;
  // Accepted for completeness of the pricing contract. Quantity doesn't
  // change the price: weight is the shipment's total weight, and COD
  // amounts are collected, not charged.
  shipmentQuantity?: number;
  codAmount?: number;
};

export const calculateShipmentPrice = ({
  rule,
  distanceKm,
  durationMinutes = 0,
  weightKg = null,
  recipientPaymentType = 'prepaid',
}: PriceInput): PriceBreakdown => {
  const distanceHundredths = toHundredths(billableDistanceKm(distanceKm));
  const extraDistanceHundredths = Math.max(0, distanceHundredths - toHundredths(rule.baseDistanceKm));

  const weight = billableWeightKg(weightKg);
  const extraWeightHundredths = Math.max(0, toHundredths(weight ?? 0) - toHundredths(rule.includedWeightKg));

  const baseFils = toHundredths(rule.basePrice);
  const distanceFils = chargeFils(extraDistanceHundredths, rule.additionalPricePerKm);
  const weightFils = chargeFils(extraWeightHundredths, rule.additionalPricePerKg);
  const codFils = recipientPaymentType === 'postpaid' ? toHundredths(rule.codFee) : 0;

  return {
    deliveryType: rule.deliveryType,
    accountType: rule.accountType,
    // 2-decimal billable distance: store this, and price from this.
    distanceKm: distanceHundredths / 100,
    durationMinutes: Math.round(durationMinutes),
    weightKg: weight,
    baseDistanceKm: rule.baseDistanceKm,
    basePrice: baseFils / 100,
    additionalDistanceKm: extraDistanceHundredths / 100,
    distanceCharge: distanceFils / 100,
    includedWeightKg: rule.includedWeightKg,
    additionalWeightKg: extraWeightHundredths / 100,
    weightCharge: weightFils / 100,
    codCharge: codFils / 100,
    otherCharges: 0,
    totalPrice: (baseFils + distanceFils + weightFils + codFils) / 100,
    currency: rule.currency,
    maxDistanceKm: rule.maxDistanceKm,
    exceedsDistanceLimit: distanceHundredths > toHundredths(rule.maxDistanceKm),
  };
};

// Sum of several shipments' prices, in fils so it never drifts.
export const sumPrices = (prices: number[]) => prices.reduce((sum, price) => sum + toHundredths(price), 0) / 100;
