import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';
import { statusesFor } from '@/lib/shipment/filters';

import type { Paginated } from '@/lib/pagination';
import type { ShipmentFilters } from '@/lib/shipment/filters';
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
  // Verified COD (goods money) collected, all time (driver_cod_stats, 0049).
  codCollected: number;
  // Cash the driver holds now and still has to hand over: verified
  // collections less confirmed remittances (driver_cash_overview, 0048). A
  // remittance lowers it only once an operator or manager confirms it.
  cashOutstanding: number;
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

  const { data, error } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS)
    .eq('driver_id', driverId)
    .in('status', ACTIVE_DRIVER_STATUSES)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as ShipmentRow[]).map(mapRowToShipment);
};

// Finished deliveries grow forever, so they're read a page at a time.
export const listDriverHistory = async (driverId: string, page: number): Promise<Paginated<Shipment>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const { data, count, error } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS, { count: 'exact' })
    .eq('driver_id', driverId)
    .in('status', TERMINAL_STATUSES)
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);

  return toPaginated(((data ?? []) as ShipmentRow[]).map(mapRowToShipment), count ?? 0, page);
};

// The driver's search: matched and paged in the database
// (search_driver_shipments, migration 0035), which only ever looks at the
// shipments assigned to the signed-in driver — there is no driver id to
// pass, so none can be swapped in. Every status, active or finished.
export const searchDriverShipments = async (page: number, filters: ShipmentFilters): Promise<Paginated<Shipment>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const { data, count, error } = await supabase
    .rpc(
      'search_driver_shipments',
      {
        p_query: filters.q || null,
        p_statuses: statusesFor(filters.status),
        p_from: filters.from,
        p_to: filters.to,
      },
      { count: 'exact' },
    )
    .select(SHIPMENT_SELECT_COLUMNS)
    .range(from, to);
  // A page past the last match (an old link, fewer matches now): no rows,
  // so the page can send the driver back to page 1.
  if (error?.code === 'PGRST103') return toPaginated([], 0, page);
  if (error) throw new Error(error.message);
  return toPaginated(((data ?? []) as unknown as ShipmentRow[]).map(mapRowToShipment), count ?? 0, page);
};

// Counts come from driver_shipment_stats / driver_cod_stats (migration
// 0021) instead of loading the driver's whole delivery history, the cash
// balance from driver_cash_overview (0048), and the reads run in parallel.
export const getDriverDashboardSummary = async (driverId: string): Promise<DriverDashboardSummary> => {
  const supabase = await createClient();

  const [statsResult, codResult, cashResult, currentResult, recentResult] = await Promise.all([
    supabase
      .from('driver_shipment_stats')
      .select('today_count, delivered_count, active_count')
      .eq('driver_id', driverId)
      .maybeSingle(),
    supabase.from('driver_cod_stats').select('cod_collected').eq('driver_id', driverId).maybeSingle(),
    supabase.rpc('driver_cash_overview', { p_driver_id: driverId }),
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
  if (statsResult.error) throw new Error(statsResult.error.message);
  if (codResult.error) throw new Error(codResult.error.message);
  if (cashResult.error) throw new Error(cashResult.error.message);
  if (currentResult.error) throw new Error(currentResult.error.message);
  if (recentResult.error) throw new Error(recentResult.error.message);

  const recent = ((recentResult.data ?? []) as ShipmentRow[]).map(mapRowToShipment);

  return {
    todayCount: statsResult.data?.today_count ?? 0,
    completedCount: statsResult.data?.delivered_count ?? 0,
    pendingCount: statsResult.data?.active_count ?? 0,
    codCollected: Number(codResult.data?.cod_collected ?? 0),
    cashOutstanding: Number((cashResult.data as { outstanding?: number | string } | null)?.outstanding ?? 0),
    currency: recent[0]?.currency ?? 'AED',
    currentShipmentId: currentResult.data?.id ?? null,
    recent,
  };
};
