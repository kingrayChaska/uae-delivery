'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { cancelShipmentAction } from '@/lib/shipment/actions';

export const useCancelShipment = (shipmentId: string) => {
  const router = useRouter();
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setIsCancelling(true);
    setError(null);
    const result = await cancelShipmentAction(shipmentId);
    setIsCancelling(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
  };

  return { cancel, isCancelling, error };
};
