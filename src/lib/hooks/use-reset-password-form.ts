'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { updatePasswordAction } from '@/lib/auth/actions';
import { resetPasswordSchema } from '@/lib/auth/schemas';

import type { ResetPasswordInput } from '@/lib/auth/schemas';

export const useResetPasswordForm = () => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    const result = await updatePasswordAction(input);

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
  };
};
