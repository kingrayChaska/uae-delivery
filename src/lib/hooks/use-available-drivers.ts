'use client';

import { useEffect, useState } from 'react';

import { getAvailableDriversAction } from '@/lib/dispatch/actions';

import type { Coordinates } from '@/lib/types';
import type { AvailableDriver } from '@/services/drivers/list-available-drivers';

type Result = { location: string; refreshKey: string | null; drivers: AvailableDriver[] };

// Keyed on the lat/lng primitives, not the object: realtime-driven
// router.refresh() hands back fresh coordinate objects for the same
// pickup, and depending on the reference would refetch every refresh.
// Loading/empty states are derived from whether the stored result matches
// the current key, so the effect only ever sets state from its async
// callback (never synchronously in the effect body). refreshKey (e.g. the
// current assignee) refetches when it changes, so counts stay current; the
// previous list for the same pickup stays on screen meanwhile.
export const useAvailableDrivers = (pickup: Coordinates | null, refreshKey: string | null = null) => {
  const [result, setResult] = useState<Result | null>(null);

  const lat = pickup?.lat ?? null;
  const lng = pickup?.lng ?? null;
  const location = lat !== null && lng !== null ? `${lat},${lng}` : null;

  useEffect(() => {
    if (lat === null || lng === null) return;

    let cancelled = false;
    getAvailableDriversAction({ lat, lng }).then((drivers) => {
      if (!cancelled) setResult({ location: `${lat},${lng}`, refreshKey, drivers });
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lng, refreshKey]);

  const sameLocation = location !== null && result?.location === location;

  return {
    drivers: sameLocation ? result.drivers : [],
    isLoading: location !== null && !(sameLocation && result.refreshKey === refreshKey),
  };
};
