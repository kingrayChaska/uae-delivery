import type { AccountType, DeliveryType, PricingRule, PricingRuleSet } from '@/lib/types';

// Fallback rules, used only when the pricing_rules table can't be read
// (no Supabase env in a preview build, or an unseeded database). Real
// prices come from the active pricing_rules rows (migration 0022), which a
// manager edits on the Pricing page — nothing else should hard-code these
// numbers. They mirror what migrations 0022, 0027 and 0033 set.
const rule = (
  id: string,
  name: string,
  deliveryType: DeliveryType,
  accountType: AccountType,
  values: Pick<PricingRule, 'baseDistanceKm' | 'basePrice' | 'additionalPricePerKm'>,
): PricingRule => ({
  id,
  name,
  deliveryType,
  accountType,
  ...values,
  includedWeightKg: 20,
  additionalPricePerKg: 1,
  codFee: 0,
  // Merchants can send to any distance; individuals up to 90 km.
  maxDistanceKm: accountType === 'merchant' ? null : 90,
  currency: 'AED',
  isActive: true,
});

// A merchant pays one flat fee per shipment for either service (plus the
// weight charge over the included weight). The live rate is the active
// merchant pricing_rules row (migration 0033 set it); this mirrors it.
export const MERCHANT_FLAT_FEE = 15;

export const DEFAULT_PRICING_RULES: PricingRuleSet = {
  individual: {
    same_day: rule('default-individual-same_day', 'Same-Day Standard', 'same_day', 'individual', {
      baseDistanceKm: 5,
      basePrice: 12,
      additionalPricePerKm: 1,
    }),
    next_day: rule('default-individual-next_day', 'Next-Day Standard', 'next_day', 'individual', {
      baseDistanceKm: 5,
      basePrice: 8,
      additionalPricePerKm: 0.75,
    }),
  },
  merchant: {
    same_day: rule('default-merchant-same_day', 'Merchant Same-Day Flat', 'same_day', 'merchant', {
      baseDistanceKm: 50,
      basePrice: MERCHANT_FLAT_FEE,
      additionalPricePerKm: 0,
    }),
    next_day: rule('default-merchant-next_day', 'Merchant Next-Day Flat', 'next_day', 'merchant', {
      baseDistanceKm: 50,
      basePrice: MERCHANT_FLAT_FEE,
      additionalPricePerKm: 0,
    }),
  },
};

// Fallback rules have no database row, so a booking can never be priced
// against one (the database would reject it anyway).
export const isFallbackRule = (pricingRule: PricingRule) => pricingRule.id.startsWith('default-');

// Upper bound on what a driver is asked to collect for the goods — matches
// shipments_cod_amount_check (migration 0022).
export const MAX_COD_AMOUNT = 100000;

// A merchant rule with no per-km charge is a flat rate up to the distance limit.
export const isFlatRate = (pricingRule: PricingRule) => pricingRule.additionalPricePerKm === 0;

// The longest trip any of these rules accepts; null when one has no limit.
export const widestDistanceLimit = (...pricingRules: PricingRule[]) =>
  pricingRules.some((r) => r.maxDistanceKm === null)
    ? null
    : Math.max(...pricingRules.map((r) => r.maxDistanceKm as number));
