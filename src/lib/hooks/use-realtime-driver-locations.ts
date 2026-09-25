'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { mergeDriverLocation } from '@/lib/dispatch/driver-location-reducer';

import type { DriverLocationEvent, DriverLocationState } from '@/lib/dispatch/driver-location-reducer';

// RLS on driver_locations (migration 0006) already scopes what a given
// subscriber's realtime feed can see — a staff session sees every
// driver's pings, a driver's own session would only see their own. This
// hook is used from staff-only pages, so it relies on that RLS breadth
// rather than filtering client-side.
export const useRealtimeDriverLocations = (initial: Record<string, DriverLocationState> = {}) => {
  const [locations, setLocations] = useState(initial);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('driver-locations-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_locations' },
        (payload) => {
          setLocations((current) => mergeDriverLocation(current, payload.new as DriverLocationEvent));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return locations;
};
