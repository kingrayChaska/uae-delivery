import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { DriverAvailability } from '@/lib/types';

export type DriverSummary = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  active: boolean;
  driverCode: string;
  availability: DriverAvailability;
  vehicle: string | null;
  todayDeliveries: number;
  weekDeliveries: number;
  monthDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  codCollected: number;
};

type DriverStatsRow = {
  driver_id: string;
  today_count: number;
  week_count: number;
  month_count: number;
  delivered_count: number;
  failed_count: number;
};

// Per-driver counts come from driver_shipment_stats / driver_cod_stats
// (migration 0021), aggregated in the database, instead of downloading
// every shipment each driver has ever carried. Today/week/month are UAE
// calendar periods. The fleet itself is small enough to list in one go.
export const listAllDrivers = async (): Promise<DriverSummary[]> => {
  const supabase = await createClient();

  const [{ data: driverRows }, { data: statsRows }, { data: codRows }] = await Promise.all([
    supabase
      .from('driver_profiles')
      .select('profile_id, driver_code, availability, profiles(full_name, phone, email, active), vehicles(make, model)'),
    supabase
      .from('driver_shipment_stats')
      .select('driver_id, today_count, week_count, month_count, delivered_count, failed_count'),
    supabase.from('driver_cod_stats').select('driver_id, collected_total'),
  ]);

  if (!driverRows || driverRows.length === 0) return [];

  const stats = new Map(((statsRows ?? []) as DriverStatsRow[]).map((row) => [row.driver_id, row]));
  const cod = new Map((codRows ?? []).map((row) => [row.driver_id, Number(row.collected_total)]));

  return driverRows.map((row) => {
    const profile = row.profiles as unknown as { full_name: string; phone: string; email: string; active: boolean } | null;
    const vehicle = row.vehicles as unknown as { make: string; model: string } | null;
    const counts = stats.get(row.profile_id);

    return {
      id: row.profile_id,
      fullName: profile?.full_name ?? 'Driver',
      phone: profile?.phone ?? '',
      email: profile?.email ?? '',
      active: profile?.active ?? false,
      driverCode: row.driver_code,
      availability: row.availability,
      vehicle: vehicle ? `${vehicle.make} ${vehicle.model}` : null,
      todayDeliveries: counts?.today_count ?? 0,
      weekDeliveries: counts?.week_count ?? 0,
      monthDeliveries: counts?.month_count ?? 0,
      successfulDeliveries: counts?.delivered_count ?? 0,
      failedDeliveries: counts?.failed_count ?? 0,
      codCollected: cod.get(row.profile_id) ?? 0,
    };
  });
};
