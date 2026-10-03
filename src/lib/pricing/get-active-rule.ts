import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { DEFAULT_PRICING_RULES } from '@/lib/pricing/config';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountType, DeliveryType, PricingRule, PricingRuleSet } from '@/lib/types';

export const PRICING_RULE_COLUMNS =
  'id, name, delivery_type, account_type, base_distance_km, base_price, additional_price_per_km, included_weight_kg, additional_price_per_kg, cod_fee, max_distance_km, currency, is_active';

export type PricingRuleRow = {
  id: string;
  name: string;
  delivery_type: DeliveryType;
  account_type: AccountType;
  base_distance_km: number | string;
  base_price: number | string;
  additional_price_per_km: number | string;
  included_weight_kg: number | string;
  additional_price_per_kg: number | string;
  cod_fee: number | string;
  max_distance_km: number | string | null;
  currency: string;
  is_active: boolean;
};

export const mapPricingRule = (row: PricingRuleRow): PricingRule => ({
  id: row.id,
  name: row.name,
  deliveryType: row.delivery_type,
  accountType: row.account_type,
  baseDistanceKm: Number(row.base_distance_km),
  basePrice: Number(row.base_price),
  additionalPricePerKm: Number(row.additional_price_per_km),
  includedWeightKg: Number(row.included_weight_kg),
  additionalPricePerKg: Number(row.additional_price_per_kg),
  codFee: Number(row.cod_fee),
  maxDistanceKm: row.max_distance_km == null ? null : Number(row.max_distance_km),
  currency: row.currency,
  isActive: row.is_active,
});

// Every active rule the caller may read (pricing_rules_select_active,
// migration 0022): individual rates for everyone including anonymous
// visitors, merchant rates only for merchants and staff. Any pair the
// caller can't read — or a database that isn't configured — falls back to
// the in-code defaults, so a quote can always be SHOWN. Bookings never use
// a fallback (see isFallbackRule).
// The merchant bulk background worker has no session and passes the
// service-role client instead.
export const getActivePricingRules = async (client?: SupabaseClient): Promise<PricingRuleSet> => {
  const rules: PricingRuleSet = {
    individual: { ...DEFAULT_PRICING_RULES.individual },
    merchant: { ...DEFAULT_PRICING_RULES.merchant },
  };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return rules;

  try {
    const supabase = client ?? (await createClient());
    const { data } = await supabase.from('pricing_rules').select(PRICING_RULE_COLUMNS).eq('is_active', true);
    for (const row of (data ?? []) as PricingRuleRow[]) {
      rules[row.account_type][row.delivery_type] = mapPricingRule(row);
    }
  } catch {
    // Keep the defaults.
  }

  return rules;
};

export const getActivePricingRule = async (
  accountType: AccountType,
  deliveryType: DeliveryType,
): Promise<PricingRule> => (await getActivePricingRules())[accountType][deliveryType];
