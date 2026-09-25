import type { PriceBreakdown, PricingRule } from '@/lib/types';

// Pure function, no DB access — the DB-driven active PricingRule is fetched
// separately (services/shipments, Phase 2+) and passed in here. This is the
// ONLY place the pricing formula is implemented; nothing else should
// hard-code the "5", "12" or "1" from the default rule.
// The price MUST be computed from exactly the distance that gets stored
// (shipments.distance_km is numeric(7,2)), because the database re-derives
// the price from the stored value to verify it (shipment_price_is_valid,
// migrations 0006/0016). Pricing from the unrounded route distance while
// storing a rounded one made those disagree — e.g. 24.7639 km priced at
// AED 31.76 but stored as 24.8 km, which the database checks as AED 31.80 —
// and the booking was rejected. Found by the end-to-end suite (Phase 13).
//
// The arithmetic runs in integer hundredths so it matches Postgres's exact
// decimal math: round(base + extra_km * per_km, 2), half away from zero.
const toHundredths = (value: number) => Math.round(value * 100);

export const billableDistanceKm = (distanceKm: number) => toHundredths(Math.max(0, distanceKm)) / 100;

export const calculatePrice = (
  distanceKm: number,
  durationMinutes: number,
  rule: PricingRule,
): PriceBreakdown => {
  const distanceHundredths = toHundredths(billableDistanceKm(distanceKm));
  const extraHundredths = Math.max(0, distanceHundredths - toHundredths(rule.baseDistanceKm));
  // hundredths of a km x hundredths of AED/km = ten-thousandths of AED;
  // + 50 then integer-divide by 100 = round half up to fils (cents).
  const additionalFils = Math.floor((extraHundredths * toHundredths(rule.additionalPricePerKm) + 50) / 100);
  const totalFils = toHundredths(rule.basePrice) + additionalFils;

  return {
    // 2-decimal billable distance: store this, and price from this.
    distanceKm: distanceHundredths / 100,
    durationMinutes: Math.round(durationMinutes),
    baseDistanceKm: rule.baseDistanceKm,
    basePrice: rule.basePrice,
    additionalDistanceKm: extraHundredths / 100,
    additionalPrice: additionalFils / 100,
    totalPrice: totalFils / 100,
    currency: rule.currency,
  };
};

export const DEFAULT_PRICING_RULE: PricingRule = {
  id: 'default',
  name: 'Standard',
  baseDistanceKm: 5,
  basePrice: 12,
  additionalPricePerKm: 1,
  currency: 'AED',
  isActive: true,
};
