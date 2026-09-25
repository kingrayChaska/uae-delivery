'use server';

import { requireRole } from '@/lib/auth/guards';
import { isUuid } from '@/lib/security/validate';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { logAuditEvent } from '@/lib/audit/log';
import { pricingRuleSchema } from '@/lib/pricing/schemas';

import type { PricingRuleInput } from '@/lib/pricing/schemas';

export type PricingActionResult = { success: true } | { success: false; error: string };

const getActiveRuleSnapshot = async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('pricing_rules')
    .select('id, name, base_distance_km, base_price, additional_price_per_km')
    .eq('is_active', true)
    .maybeSingle();
  return data;
};

// Pricing rules are never edited in place: a change is a new row, so every
// shipment's pricing_rule_id keeps pointing at the exact rule it was
// priced under. The enforce_single_active_pricing_rule trigger (0005)
// deactivates the previous rule when a new one is activated.
export const createPricingRuleAction = async (input: PricingRuleInput): Promise<PricingActionResult> => {
  const manager = await requireRole('manager');
  const parsed = pricingRuleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const previous = parsed.data.activate ? await getActiveRuleSnapshot() : null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('pricing_rules')
    .insert({
      name: parsed.data.name,
      base_distance_km: parsed.data.baseDistanceKm,
      base_price: parsed.data.basePrice,
      additional_price_per_km: parsed.data.additionalPricePerKm,
      currency: 'AED',
      is_active: parsed.data.activate,
      created_by: manager.id,
    })
    .select('id')
    .single();

  if (error || !data) return { success: false, error: safeErrorMessage(error, 'Could not save the rule') };

  await logAuditEvent({
    actorId: manager.id,
    action: parsed.data.activate ? 'pricing.create_and_activate' : 'pricing.create',
    entityType: 'pricing_rule',
    entityId: data.id,
    oldValue: previous,
    newValue: parsed.data,
  });

  return { success: true };
};

export const activatePricingRuleAction = async (ruleId: string): Promise<PricingActionResult> => {
  if (!isUuid(ruleId)) return { success: false, error: 'Not found' };
  const manager = await requireRole('manager');
  const previous = await getActiveRuleSnapshot();
  if (previous?.id === ruleId) return { success: true };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('pricing_rules')
    .update({ is_active: true })
    .eq('id', ruleId)
    .select('id, name, base_distance_km, base_price, additional_price_per_km')
    .maybeSingle();

  if (error || !data) return { success: false, error: safeErrorMessage(error, 'Pricing rule not found') };

  await logAuditEvent({
    actorId: manager.id,
    action: 'pricing.activate',
    entityType: 'pricing_rule',
    entityId: ruleId,
    oldValue: previous,
    newValue: data,
  });

  return { success: true };
};
