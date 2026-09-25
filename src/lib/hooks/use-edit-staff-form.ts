'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { updateStaffAction } from '@/lib/staff/actions';
import { updateStaffSchema } from '@/lib/staff/schemas';

import type { UpdateStaffInput } from '@/lib/staff/schemas';

export const useEditStaffForm = (defaultValues: UpdateStaffInput) => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<UpdateStaffInput>({ resolver: zodResolver(updateStaffSchema), defaultValues });

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    setSaved(false);
    const result = await updateStaffAction(input);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
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
