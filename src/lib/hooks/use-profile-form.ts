'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { updateProfileAction } from '@/lib/auth/actions';
import { updateProfileSchema } from '@/lib/auth/schemas';

import type { UpdateProfileInput } from '@/lib/auth/schemas';

export const useProfileForm = (defaultValues: UpdateProfileInput) => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues,
  });

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    setSuccessMessage(null);
    const result = await updateProfileAction(input);

    if (!result.success) {
      setServerError(result.error);
      return;
    }

    setSuccessMessage('Profile updated.');
    router.refresh();
  });

  return {
    register: form.register,
    errors: form.formState.errors,
    isSubmitting: form.formState.isSubmitting,
    serverError,
    successMessage,
    onSubmit,
  };
};
