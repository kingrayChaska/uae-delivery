'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { markCodCollectedAction } from '@/lib/driver/actions';

export const useMarkCodCollected = (codTransactionId: string) => {
  const router = useRouter();
  const [isMarking, setIsMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markCollected = async () => {
    setIsMarking(true);
    setError(null);
    const result = await markCodCollectedAction(codTransactionId);
    setIsMarking(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return { markCollected, isMarking, error };
};
