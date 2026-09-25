import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { PricingRule } from '@/lib/types';

export type PricingRuleRecord = PricingRule & { createdAt: string };

// pricing_rules_select_active lets staff see inactive/historical rules too.
export const listPricingRules = async (): Promise<PricingRuleRecord[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('pricing_rules')
    .select('id, name, base_distance_km, base_price, additional_price_per_km, currency, is_active, created_at')
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    baseDistanceKm: Number(row.base_distance_km),
    basePrice: Number(row.base_price),
    additionalPricePerKm: Number(row.additional_price_per_km),
    currency: row.currency,
    isActive: row.is_active,
    createdAt: row.created_at,
  }));
};
