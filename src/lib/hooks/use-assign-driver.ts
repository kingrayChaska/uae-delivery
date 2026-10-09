'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { assignDriverAction, reassignDriverAction } from '@/lib/dispatch/actions';

// currentDriverId is the assignee this page was rendered with; reassignment
// sends it so the server can reject a click made against a stale view.
export const useAssignDriver = (shipmentId: string, mode: 'assign' | 'reassign', currentDriverId: string | null = null) => {
  const router = useRouter();
  // A ref, not state: two clicks can land before React re-renders the
  // buttons as disabled, and only a synchronous guard stops the second.
  const inFlightRef = useRef(false);
  const [pendingDriverId, setPendingDriverId] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const assign = async (driverId: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPendingDriverId(driverId);
    setError(null);

    try {
      const result =
        mode === 'assign'
          ? await assignDriverAction(shipmentId, driverId)
          : await reassignDriverAction(shipmentId, driverId, currentDriverId);

      if (!result.success) {
        setError(result.error);
        // A stale view is the likely cause; pull the current assignee.
        if (result.error === 'operator.errors.assignmentChanged') startRefresh(() => router.refresh());
        return;
      }
      // Stay busy until the refreshed page (with the new assignee) has
      // rendered, so the old list can't be clicked in between.
      startRefresh(() => router.refresh());
    } catch {
      setError('errors.generic');
    } finally {
      setPendingDriverId(null);
      inFlightRef.current = false;
    }
  };

  return { assign, pendingDriverId, isAssigning: pendingDriverId !== null || isRefreshing, error };
};
