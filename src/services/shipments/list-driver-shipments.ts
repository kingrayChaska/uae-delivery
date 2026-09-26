import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { Paginated } from '@/lib/pagination';
import type { Shipment } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';

export const ACTIVE_DRIVER_STATUSES = [
  'assigned',
  'driver_accepted',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
];

const TERMINAL_STATUSES = ['delivered', 'delivery_failed', 'cancelled', 'returned'];

export type DriverDashboardSummary = {
  todayCount: number;
  completedCount: number;
  pendingCount: number;
  codCollected: number;
  currency: string;
  currentShipmentId: string | null;
  recent: Shipment[];
};

// RLS (shipments_select) already scopes these to shipments assigned to the
// caller — the explicit driver_id filters keep each query's intent obvious
// and let it use the (driver_id, created_at) index.

// Work in hand is naturally short, so it isn't paginated.
export const listDriverActiveShipments = async (driverId: string): Promise<Shipment[]> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS)
    .eq('driver_id', driverId)
    .in('status', ACTIVE_DRIVER_STATUSES)
    .order('created_at', { ascending: false });

  return ((data ?? []) as ShipmentRow[]).map(mapRowToShipment);
};

// Finished deliveries grow forever, so they're read a page at a time.
export const listDriverHistory = async (driverId: string, page: number): Promise<Paginated<Shipment>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const { data, count } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS, { count: 'exact' })
    .eq('driver_id', driverId)
    .in('status', TERMINAL_STATUSES)
    .order('created_at', { ascending: false })
    .range(from, to);

  return toPaginated(((data ?? []) as ShipmentRow[]).map(mapRowToShipment), count ?? 0, page);
};

// Counts come from driver_shipment_stats / driver_cod_stats (migration
// 0021) instead of loading the driver's whole delivery history, and the
// four reads run in parallel.
export const getDriverDashboardSummary = async (driverId: string): Promise<DriverDashboardSummary> => {
  const supabase = await createClient();

  const [{ data: stats }, { data: cod }, { data: current }, { data: recentRows }] = await Promise.all([
    supabase
      .from('driver_shipment_stats')
      .select('today_count, delivered_count, active_count')
      .eq('driver_id', driverId)
      .maybeSingle(),
    supabase.from('driver_cod_stats').select('collected_total').eq('driver_id', driverId).maybeSingle(),
    // "Current" is the oldest non-terminal shipment — the one the driver
    // should act on next, whether that's accepting a new assignment or
    // continuing one already in progress.
    supabase
      .from('shipments')
      .select('id')
      .eq('driver_id', driverId)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('shipments')
      .select(SHIPMENT_SELECT_COLUMNS)
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const recent = ((recentRows ?? []) as ShipmentRow[]).map(mapRowToShipment);

  return {
    todayCount: stats?.today_count ?? 0,
    completedCount: stats?.delivered_count ?? 0,
    pendingCount: stats?.active_count ?? 0,
    codCollected: Number(cod?.collected_total ?? 0),
    currency: recent[0]?.currency ?? 'AED',
    currentShipmentId: current?.id ?? null,
    recent,
  };
};
