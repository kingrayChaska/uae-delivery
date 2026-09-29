'use server';

import { requireRole } from '@/lib/auth/guards';
import { isUuid } from '@/lib/security/validate';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { logAuditEvent } from '@/lib/audit/log';
import { pricingRuleSchema } from '@/lib/pricing/schemas';
import { PRICING_RULE_COLUMNS } from '@/lib/pricing/get-active-rule';

import type { PricingRuleInput } from '@/lib/pricing/schemas';
import type { AccountType, DeliveryType } from '@/lib/types';

export type PricingActionResult = { success: true } | { success: false; error: string };

const getActiveRuleSnapshot = async (deliveryType: DeliveryType, accountType: AccountType) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('pricing_rules')
    .select(PRICING_RULE_COLUMNS)
    .eq('is_active', true)
    .eq('delivery_type', deliveryType)
    .eq('account_type', accountType)
    .maybeSingle();
  return data;
};

// Pricing rules are never edited in place: a change is a new row, so every
// shipment's pricing_rule_id keeps pointing at the exact rule it was
// priced under. The enforce_single_active_pricing_rule trigger (0022)
// deactivates the previous rule for the same service and account type.
export const createPricingRuleAction = async (input: PricingRuleInput): Promise<PricingActionResult> => {
  const manager = await requireRole('manager');
  const parsed = pricingRuleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'validation.invalid' };
  const rule = parsed.data;

  const previous = rule.activate ? await getActiveRuleSnapshot(rule.deliveryType, rule.accountType) : null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('pricing_rules')
    .insert({
      name: rule.name,
      delivery_type: rule.deliveryType,
      account_type: rule.accountType,
      base_distance_km: rule.baseDistanceKm,
      base_price: rule.basePrice,
      additional_price_per_km: rule.additionalPricePerKm,
      included_weight_kg: rule.includedWeightKg,
      additional_price_per_kg: rule.additionalPricePerKg,
      cod_fee: rule.codFee,
      max_distance_km: rule.maxDistanceKm,
      currency: 'AED',
      is_active: rule.activate,
      created_by: manager.id,
    })
    .select('id')
    .single();

  if (error || !data) return { success: false, error: safeErrorMessage(error, 'manager.pricing.errors.saveFailed') };

  await logAuditEvent({
    actorId: manager.id,
    action: rule.activate ? 'pricing.create_and_activate' : 'pricing.create',
    entityType: 'pricing_rule',
    entityId: data.id,
    oldValue: previous,
    newValue: rule,
  });

  return { success: true };
};

export const activatePricingRuleAction = async (ruleId: string): Promise<PricingActionResult> => {
  if (!isUuid(ruleId)) return { success: false, error: 'errors.notFound' };
  const manager = await requireRole('manager');
  const supabase = await createClient();

  const { data: target } = await supabase
    .from('pricing_rules')
    .select('delivery_type, account_type, is_active')
    .eq('id', ruleId)
    .maybeSingle();
  if (!target) return { success: false, error: 'manager.pricing.errors.notFound' };
  if (target.is_active) return { success: true };

  const previous = await getActiveRuleSnapshot(target.delivery_type, target.account_type);

  const { data, error } = await supabase
    .from('pricing_rules')
    .update({ is_active: true })
    .eq('id', ruleId)
    .select(PRICING_RULE_COLUMNS)
    .maybeSingle();

  if (error || !data) return { success: false, error: safeErrorMessage(error, 'manager.pricing.errors.notFound') };

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
