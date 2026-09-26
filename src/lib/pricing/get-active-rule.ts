import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PRICING_RULE } from "@/lib/pricing/calculate";

import type { PricingRule } from "@/lib/types";

// The active pricing_rules row is public-readable (see migration 0005), so
// this can be called from any server context — the booking flow's live
// quote, the landing page's pricing section, etc. Falls back to the
// in-code default only if the table is ever empty (shouldn't happen once
// the seed has run), so a misconfigured DB never hard-fails pricing.
export const getActivePricingRule = async (): Promise<PricingRule> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return DEFAULT_PRICING_RULE;
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("pricing_rules")
      .select(
        "id, name, base_distance_km, base_price, additional_price_per_km, currency",
      )
      .eq("is_active", true)
      .maybeSingle();

    if (!data) return DEFAULT_PRICING_RULE;

    return {
      id: data.id,
      name: data.name,
      baseDistanceKm: data.base_distance_km,
      basePrice: data.base_price,
      additionalPricePerKm: data.additional_price_per_km,
      currency: data.currency,
      isActive: true,
    };
  } catch {
    return DEFAULT_PRICING_RULE;
  }
};
