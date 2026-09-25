'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { assignDriverAction, reassignDriverAction } from '@/lib/dispatch/actions';

export const useAssignDriver = (shipmentId: string, mode: 'assign' | 'reassign') => {
  const router = useRouter();
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assign = async (driverId: string) => {
    setIsAssigning(true);
    setError(null);

    const result =
      mode === 'assign' ? await assignDriverAction(shipmentId, driverId) : await reassignDriverAction(shipmentId, driverId);

    setIsAssigning(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return { assign, isAssigning, error };
};
