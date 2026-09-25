import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { ACTIVE_DRIVER_STATUSES } from '@/services/shipments/list-driver-shipments';

import type { DriverAvailability } from '@/lib/types';

export type LiveMapDriver = {
  id: string;
  fullName: string;
  availability: DriverAvailability;
  hasActiveShipment: boolean;
};

export const listDriversForLiveMap = async (): Promise<LiveMapDriver[]> => {
  const supabase = await createClient();

  const { data: driverRows } = await supabase
    .from('driver_profiles')
    .select('profile_id, availability, profiles(full_name)');
  if (!driverRows || driverRows.length === 0) return [];

  const driverIds = driverRows.map((row) => row.profile_id);
  const { data: activeShipments } = await supabase
    .from('shipments')
    .select('driver_id')
    .in('driver_id', driverIds)
    .in('status', ACTIVE_DRIVER_STATUSES);

  const activeDriverIds = new Set((activeShipments ?? []).map((row) => row.driver_id));

  return driverRows.map((row) => {
    const profile = row.profiles as unknown as { full_name: string } | null;
    return {
      id: row.profile_id,
      fullName: profile?.full_name ?? 'Driver',
      availability: row.availability,
      hasActiveShipment: activeDriverIds.has(row.profile_id),
    };
  });
};
