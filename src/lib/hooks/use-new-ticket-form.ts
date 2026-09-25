'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { createTicketAction } from '@/lib/support/actions';
import { createTicketSchema } from '@/lib/support/schemas';

import type { CreateTicketInput } from '@/lib/support/schemas';

export const useNewTicketForm = () => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { subject: '', message: '' },
  });

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    const result = await createTicketAction(input);

    if (!result.success) {
      setServerError(result.error);
      return;
    }

    router.push(`/dashboard/customer/support/${result.ticketId}`);
  });

  return {
    register: form.register,
    errors: form.formState.errors,
    isSubmitting: form.formState.isSubmitting,
    serverError,
    onSubmit,
  };
};
