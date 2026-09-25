'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useTurnstile } from '@/lib/hooks/use-turnstile';

import { requestPasswordResetAction } from '@/lib/auth/actions';
import { forgotPasswordSchema } from '@/lib/auth/schemas';

import type { ForgotPasswordInput } from '@/lib/auth/schemas';

export const useForgotPasswordForm = () => {
  const turnstile = useTurnstile();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    setSuccessMessage(null);
    const result = await requestPasswordResetAction(input, turnstile.token);
    turnstile.reset();

    if (!result.success) {
      setServerError(result.error);
      return;
    }

    setSuccessMessage(result.message ?? 'Check your email for a reset link.');
    form.reset();
  });

  return {
    register: form.register,
    errors: form.formState.errors,
    isSubmitting: form.formState.isSubmitting,
    serverError,
    successMessage,
    onSubmit,
    turnstile,
  };
};
