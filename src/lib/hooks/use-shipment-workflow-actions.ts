'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  acceptShipmentAction,
  advanceShipmentStatusAction,
  declineShipmentAction,
  reportDeliveryFailedAction,
} from '@/lib/driver/actions';

import type { ShipmentStatus } from '@/lib/types';

export const useShipmentWorkflowActions = (shipmentId: string) => {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolves whether the step went through, so a caller can close its form.
  const run = async (action: () => Promise<{ success: boolean; error?: string }>) => {
    setIsPending(true);
    setError(null);
    const result = await action();
    setIsPending(false);

    if (!result.success) {
      setError(result.error ?? 'driver.errors.generic');
      return false;
    }
    router.refresh();
    return true;
  };

  return {
    isPending,
    error,
    accept: () => run(() => acceptShipmentAction(shipmentId)),
    decline: () => run(() => declineShipmentAction(shipmentId)),
    advance: (nextStatus: Exclude<ShipmentStatus, 'delivered'>) =>
      run(() => advanceShipmentStatusAction(shipmentId, nextStatus)),
    reportFailed: (reason: string) => run(() => reportDeliveryFailedAction({ shipmentId, reason })),
  };
};
