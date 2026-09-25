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

export const listAllDrivers = async (): Promise<DriverSummary[]> => {
  const supabase = await createClient();

  const { data: driverRows } = await supabase
    .from('driver_profiles')
    .select('profile_id, driver_code, availability, profiles(full_name, phone, email, active), vehicles(make, model)');

  if (!driverRows || driverRows.length === 0) return [];

  const driverIds = driverRows.map((row) => row.profile_id);
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [{ data: shipmentRows }, { data: codRows }] = await Promise.all([
    supabase.from('shipments').select('driver_id, status, created_at').in('driver_id', driverIds),
    supabase
      .from('cod_transactions')
      .select('driver_id, amount')
      .in('driver_id', driverIds)
      .in('status', ['collected', 'reconciled', 'remitted']),
  ]);

  return driverRows.map((row) => {
    const profile = row.profiles as unknown as { full_name: string; phone: string; email: string; active: boolean } | null;
    const vehicle = row.vehicles as unknown as { make: string; model: string } | null;
    const shipments = (shipmentRows ?? []).filter((s) => s.driver_id === row.profile_id);

    return {
      id: row.profile_id,
      fullName: profile?.full_name ?? 'Driver',
      phone: profile?.phone ?? '',
      email: profile?.email ?? '',
      active: profile?.active ?? false,
      driverCode: row.driver_code,
      availability: row.availability,
      vehicle: vehicle ? `${vehicle.make} ${vehicle.model}` : null,
      todayDeliveries: shipments.filter((s) => new Date(s.created_at) >= startOfDay).length,
      weekDeliveries: shipments.filter((s) => new Date(s.created_at) >= startOfWeek).length,
      monthDeliveries: shipments.filter((s) => new Date(s.created_at) >= startOfMonth).length,
      successfulDeliveries: shipments.filter((s) => s.status === 'delivered').length,
      failedDeliveries: shipments.filter((s) => s.status === 'delivery_failed').length,
      codCollected: (codRows ?? [])
        .filter((c) => c.driver_id === row.profile_id)
        .reduce((sum, c) => sum + c.amount, 0),
    };
  });
};
