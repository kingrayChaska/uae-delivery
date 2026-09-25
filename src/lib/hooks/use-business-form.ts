'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { createBusinessAccountAction, updateBusinessAccountAction } from '@/lib/business/actions';
import { businessAccountSchema } from '@/lib/business/schemas';

import type { BusinessAccountInput } from '@/lib/business/schemas';

const EMPTY: BusinessAccountInput = {
  companyName: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  billingAddress: '',
  trn: '',
};

export const useBusinessForm = (businessId?: string, defaultValues: BusinessAccountInput = EMPTY) => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<BusinessAccountInput>({ resolver: zodResolver(businessAccountSchema), defaultValues });

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    setSaved(false);
    const result = businessId
      ? await updateBusinessAccountAction(businessId, input)
      : await createBusinessAccountAction(input);

    if (!result.success) {
      setServerError(result.error);
      return;
    }
    if (businessId) {
      setSaved(true);
      router.refresh();
    } else {
      router.push(`/dashboard/manager/business-accounts/${result.id}`);
    }
  });

  return {
    register: form.register,
    errors: form.formState.errors,
    isSubmitting: form.formState.isSubmitting,
    serverError,
    saved,
    onSubmit,
  };
};
