import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { PRICING_RULE_COLUMNS, mapPricingRule } from '@/lib/pricing/get-active-rule';

import type { PricingRuleRow } from '@/lib/pricing/get-active-rule';
import type { PricingRule } from '@/lib/types';

export type PricingRuleRecord = PricingRule & { createdAt: string };

// pricing_rules_select_active lets staff see inactive/historical rules too.
export const listPricingRules = async (): Promise<PricingRuleRecord[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('pricing_rules')
    .select(`${PRICING_RULE_COLUMNS}, created_at`)
    .order('created_at', { ascending: false })
    .limit(200);

  return ((data ?? []) as (PricingRuleRow & { created_at: string })[]).map((row) => ({
    ...mapPricingRule(row),
    createdAt: row.created_at,
  }));
};
