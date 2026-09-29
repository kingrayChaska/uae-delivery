import type { AccountType, DeliveryType, PricingRule, PricingRuleSet } from '@/lib/types';

// Fallback rules, used only when the pricing_rules table can't be read
// (no Supabase env in a preview build, or an unseeded database). Real
// prices come from the active pricing_rules rows (migration 0022), which a
// manager edits on the Pricing page — nothing else should hard-code these
// numbers. They mirror what migration 0022 seeds.
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
  maxDistanceKm: 50,
  currency: 'AED',
  isActive: true,
});

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
      basePrice: 15,
      additionalPricePerKm: 0,
    }),
    next_day: rule('default-merchant-next_day', 'Merchant Next-Day Flat', 'next_day', 'merchant', {
      baseDistanceKm: 50,
      basePrice: 10,
      additionalPricePerKm: 0,
    }),
  },
};

// Fallback rules have no database row, so a booking can never be priced
// against one (the database would reject it anyway).
export const isFallbackRule = (pricingRule: PricingRule) => pricingRule.id.startsWith('default-');

export const DELIVERY_TYPE_COPY: Record<DeliveryType, { label: string; description: string }> = {
  same_day: { label: 'Same-Day Delivery', description: 'Collected and delivered today.' },
  next_day: { label: 'Next-Day Delivery', description: 'Delivered the next day, at a lower price.' },
};

// Upper bound on what a driver is asked to collect for the goods — matches
// shipments_cod_amount_check (migration 0022).
export const MAX_COD_AMOUNT = 100000;

// A merchant rule with no per-km charge is a flat rate up to the distance limit.
export const isFlatRate = (pricingRule: PricingRule) => pricingRule.additionalPricePerKm === 0;
