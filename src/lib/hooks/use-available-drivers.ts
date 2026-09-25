'use client';

import { useEffect, useState } from 'react';

import { getAvailableDriversAction } from '@/lib/dispatch/actions';

import type { Coordinates } from '@/lib/types';
import type { AvailableDriver } from '@/services/drivers/list-available-drivers';

type Result = { key: string; drivers: AvailableDriver[] };

// Keyed on the lat/lng primitives, not the object: realtime-driven
// router.refresh() hands back fresh coordinate objects for the same
// pickup, and depending on the reference would refetch every refresh.
// Loading/empty states are derived from whether the stored result matches
// the current key, so the effect only ever sets state from its async
// callback (never synchronously in the effect body).
export const useAvailableDrivers = (pickup: Coordinates | null) => {
  const [result, setResult] = useState<Result | null>(null);

  const lat = pickup?.lat ?? null;
  const lng = pickup?.lng ?? null;
  const key = lat !== null && lng !== null ? `${lat},${lng}` : null;

  useEffect(() => {
    if (lat === null || lng === null) return;

    let cancelled = false;
    const requestKey = `${lat},${lng}`;

    getAvailableDriversAction({ lat, lng }).then((drivers) => {
      if (!cancelled) setResult({ key: requestKey, drivers });
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const isCurrent = key !== null && result?.key === key;

  return {
    drivers: isCurrent ? result.drivers : [],
    isLoading: key !== null && !isCurrent,
  };
};
