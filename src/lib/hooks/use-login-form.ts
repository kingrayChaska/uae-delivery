'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useTurnstile } from '@/lib/hooks/use-turnstile';
import { useRouter } from 'next/navigation';

import { loginAction } from '@/lib/auth/actions';
import { loginSchema } from '@/lib/auth/schemas';

import type { LoginInput } from '@/lib/auth/schemas';

export const useLoginForm = () => {
  const turnstile = useTurnstile();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    const result = await loginAction(input, turnstile.token);
    turnstile.reset();

    if (!result.success) {
      setServerError(result.error);
      return;
    }

    if (result.redirectTo) router.push(result.redirectTo);
  });

  return {
    register: form.register,
    errors: form.formState.errors,
    isSubmitting: form.formState.isSubmitting,
    serverError,
    onSubmit,
    turnstile,
  };
};
