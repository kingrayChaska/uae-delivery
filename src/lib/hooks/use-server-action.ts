'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ActionResult = { success: true } | { success: false; error: string };

// Shared pending/error/refresh wrapper for simple mutations (activate,
// remove member, activate pricing rule ...). Forms with field validation
// use their own react-hook-form hooks instead.
export const useServerAction = () => {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<ActionResult>, successMessage?: string) => {
    setIsPending(true);
    setError(null);
    setMessage(null);
    const result = await action();
    setIsPending(false);

    if (!result.success) {
      setError(result.error);
      return false;
    }
    if (successMessage) setMessage(successMessage);
    router.refresh();
    return true;
  };

  return { run, isPending, error, message };
};
