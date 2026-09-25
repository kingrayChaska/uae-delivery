'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { createPricingRuleAction } from '@/lib/pricing/actions';
import { pricingRuleSchema } from '@/lib/pricing/schemas';

import type { PricingRuleInput } from '@/lib/pricing/schemas';
import type { PricingRule } from '@/lib/types';

export const usePricingRuleForm = (current: PricingRule) => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<PricingRuleInput>({
    resolver: zodResolver(pricingRuleSchema),
    defaultValues: {
      name: '',
      baseDistanceKm: current.baseDistanceKm,
      basePrice: current.basePrice,
      additionalPricePerKm: current.additionalPricePerKm,
      activate: true,
    },
  });

  const values = useWatch({ control: form.control });

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    const result = await createPricingRuleAction(input);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    form.reset({ ...input, name: '' });
    router.refresh();
  });

  // Live preview of the rule being drafted, fed to the same FareCalculator
  // the landing page uses — so the manager sees real prices before saving.
  const previewRule: PricingRule = {
    id: 'preview',
    name: values.name || 'Preview',
    baseDistanceKm: Number.isFinite(values.baseDistanceKm) ? Number(values.baseDistanceKm) : 0,
    basePrice: Number.isFinite(values.basePrice) ? Number(values.basePrice) : 0,
    additionalPricePerKm: Number.isFinite(values.additionalPricePerKm) ? Number(values.additionalPricePerKm) : 0,
    currency: current.currency,
    isActive: false,
  };

  return {
    register: form.register,
    errors: form.formState.errors,
    isSubmitting: form.formState.isSubmitting,
    serverError,
    previewRule,
    onSubmit,
  };
};
