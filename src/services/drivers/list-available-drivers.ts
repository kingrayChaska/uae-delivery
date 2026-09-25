import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { haversineDistanceKm } from '@/lib/maps/haversine';
import { ACTIVE_DRIVER_STATUSES } from '@/services/shipments/list-driver-shipments';

import type { Coordinates, DriverAvailability } from '@/lib/types';

export type AvailableDriver = {
  id: string;
  fullName: string;
  availability: DriverAvailability;
  activeDeliveryCount: number;
  distanceFromPickupKm: number | null;
};

// "Available" here means the driver's own availability flag AND not
// already juggling too much — spec section 23 shows active-delivery
// count alongside distance so the Operator can judge both at a glance,
// not just an availability boolean.
export const listAvailableDrivers = async (pickup: Coordinates): Promise<AvailableDriver[]> => {
  const supabase = await createClient();

  const { data: driverRows } = await supabase
    .from('driver_profiles')
    .select('profile_id, availability, profiles(full_name)')
    .order('availability', { ascending: true });

  if (!driverRows || driverRows.length === 0) return [];

  const driverIds = driverRows.map((row) => row.profile_id);

  const [{ data: activeShipments }, { data: latestLocations }] = await Promise.all([
    supabase.from('shipments').select('driver_id').in('driver_id', driverIds).in('status', ACTIVE_DRIVER_STATUSES),
    supabase
      .from('driver_locations')
      .select('driver_id, lat, lng, recorded_at')
      .in('driver_id', driverIds)
      .order('recorded_at', { ascending: false }),
  ]);

  const activeCountByDriver = new Map<string, number>();
  for (const row of activeShipments ?? []) {
    activeCountByDriver.set(row.driver_id, (activeCountByDriver.get(row.driver_id) ?? 0) + 1);
  }

  // driver_locations is ordered newest-first, so the first match per
  // driver encountered here is their latest ping.
  const latestLocationByDriver = new Map<string, Coordinates>();
  for (const row of latestLocations ?? []) {
    if (!latestLocationByDriver.has(row.driver_id)) {
      latestLocationByDriver.set(row.driver_id, { lat: row.lat, lng: row.lng });
    }
  }

  const drivers: AvailableDriver[] = driverRows.map((row) => {
    const location = latestLocationByDriver.get(row.profile_id);
    const profile = row.profiles as unknown as { full_name: string } | null;

    return {
      id: row.profile_id,
      fullName: profile?.full_name ?? 'Driver',
      availability: row.availability,
      activeDeliveryCount: activeCountByDriver.get(row.profile_id) ?? 0,
      distanceFromPickupKm: location ? haversineDistanceKm(pickup, location) : null,
    };
  });

  return drivers.sort((a, b) => {
    if (a.distanceFromPickupKm === null) return 1;
    if (b.distanceFromPickupKm === null) return -1;
    return a.distanceFromPickupKm - b.distanceFromPickupKm;
  });
};
