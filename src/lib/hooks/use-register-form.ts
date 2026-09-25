'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useTurnstile } from '@/lib/hooks/use-turnstile';
import { useRouter } from 'next/navigation';

import { registerAction } from '@/lib/auth/actions';
import { registerSchema } from '@/lib/auth/schemas';

import type { RegisterInput } from '@/lib/auth/schemas';

export const useRegisterForm = () => {
  const turnstile = useTurnstile();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', phone: '', password: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    setSuccessMessage(null);
    const result = await registerAction(input, turnstile.token);
    turnstile.reset();

    if (!result.success) {
      setServerError(result.error);
      return;
    }

    if (result.redirectTo) {
      router.push(result.redirectTo);
      return;
    }

    if (result.message) setSuccessMessage(result.message);
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
