'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { createPricingRuleAction } from '@/lib/pricing/actions';
import { pricingRuleSchema } from '@/lib/pricing/schemas';

import type { PricingRuleInput } from '@/lib/pricing/schemas';
import type { AccountType, DeliveryType, PricingRule, PricingRuleSet } from '@/lib/types';

const valuesFrom = (rule: PricingRule) => ({
  baseDistanceKm: rule.baseDistanceKm,
  basePrice: rule.basePrice,
  additionalPricePerKm: rule.additionalPricePerKm,
  includedWeightKg: rule.includedWeightKg,
  additionalPricePerKg: rule.additionalPricePerKg,
  codFee: rule.codFee,
  maxDistanceKm: rule.maxDistanceKm,
});

const finite = (value: unknown) => (Number.isFinite(value) ? Number(value) : 0);

export const usePricingRuleForm = (current: PricingRuleSet) => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const form = useForm<PricingRuleInput>({
    resolver: zodResolver(pricingRuleSchema),
    defaultValues: {
      name: '',
      deliveryType: 'same_day',
      accountType: 'individual',
      ...valuesFrom(current.individual.same_day),
      activate: true,
    },
  });

  const values = useWatch({ control: form.control });

  // Choosing which rule to replace starts from that rule's current numbers.
  const selectTarget = (accountType: AccountType, deliveryType: DeliveryType) => {
    form.reset({ ...form.getValues(), accountType, deliveryType, ...valuesFrom(current[accountType][deliveryType]) });
  };

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    setSavedMessage(null);
    const result = await createPricingRuleAction(input);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    setSavedMessage(input.activate ? 'manager.pricing.form.savedActive' : 'manager.pricing.form.saved');
    form.reset({ ...input, name: '' });
    router.refresh();
  });

  // Live preview of the rule being drafted, fed to the same FareCalculator
  // the landing page uses — so the manager sees real prices before saving.
  const deliveryType = (values.deliveryType ?? 'same_day') as DeliveryType;
  const accountType = (values.accountType ?? 'individual') as AccountType;
  const previewRule: PricingRule = {
    id: 'preview',
    name: values.name || 'Preview',
    deliveryType,
    accountType,
    baseDistanceKm: finite(values.baseDistanceKm),
    basePrice: finite(values.basePrice),
    additionalPricePerKm: finite(values.additionalPricePerKm),
    includedWeightKg: finite(values.includedWeightKg),
    additionalPricePerKg: finite(values.additionalPricePerKg),
    codFee: finite(values.codFee),
    maxDistanceKm: finite(values.maxDistanceKm) || 1,
    currency: current[accountType][deliveryType].currency,
    isActive: false,
  };

  return {
    register: form.register,
    errors: form.formState.errors,
    isSubmitting: form.formState.isSubmitting,
    serverError,
    savedMessage,
    previewRule,
    deliveryType,
    accountType,
    selectTarget,
    onSubmit,
  };
};
