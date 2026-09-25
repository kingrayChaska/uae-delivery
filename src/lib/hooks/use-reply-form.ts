'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { replyToTicketAction } from '@/lib/support/actions';
import { replyToTicketSchema } from '@/lib/support/schemas';

import type { ReplyToTicketInput } from '@/lib/support/schemas';

export const useReplyForm = (ticketId: string) => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ReplyToTicketInput>({
    resolver: zodResolver(replyToTicketSchema),
    defaultValues: { ticketId, message: '' },
  });

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    const result = await replyToTicketAction(input);

    if (!result.success) {
      setServerError(result.error);
      return;
    }

    form.reset({ ticketId, message: '' });
    router.refresh();
  });

  return {
    register: form.register,
    errors: form.formState.errors,
    isSubmitting: form.formState.isSubmitting,
    serverError,
    onSubmit,
  };
};
