import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { DriverLocationState } from '@/lib/dispatch/driver-location-reducer';

export type DriverLocationsSnapshot = {
  locations: Record<string, DriverLocationState>;
  labels: Record<string, string>;
};

export const getDriverLocationsSnapshot = async (): Promise<DriverLocationsSnapshot> => {
  const supabase = await createClient();

  const [{ data: driverRows }, { data: locationRows }] = await Promise.all([
    supabase.from('driver_profiles').select('profile_id, profiles(full_name)'),
    supabase
      .from('driver_locations')
      .select('driver_id, lat, lng, recorded_at')
      .order('recorded_at', { ascending: false }),
  ]);

  const labels: Record<string, string> = {};
  for (const row of driverRows ?? []) {
    const profile = row.profiles as unknown as { full_name: string } | null;
    labels[row.profile_id] = profile?.full_name ?? 'Driver';
  }

  const locations: Record<string, DriverLocationState> = {};
  for (const row of locationRows ?? []) {
    if (!locations[row.driver_id]) {
      locations[row.driver_id] = {
        driverId: row.driver_id,
        coordinates: { lat: row.lat, lng: row.lng },
        recordedAt: row.recorded_at,
      };
    }
  }

  return { locations, labels };
};
