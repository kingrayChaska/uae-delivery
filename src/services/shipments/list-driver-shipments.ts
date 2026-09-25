import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

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
};

// RLS (shipments_select) already scopes this to shipments assigned to the
// caller — no explicit driver_id filter needed, but it's added anyway to
// keep the query's intent obvious to read.
export const listDriverShipments = async (driverId: string): Promise<Shipment[]> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS)
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false });

  return ((data ?? []) as ShipmentRow[]).map(mapRowToShipment);
};

export const getDriverDashboardSummary = async (driverId: string): Promise<DriverDashboardSummary> => {
  const shipments = await listDriverShipments(driverId);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayCount = shipments.filter((s) => new Date(s.createdAt) >= startOfDay).length;
  const completedCount = shipments.filter((s) => s.status === 'delivered').length;
  const pendingCount = shipments.filter((s) => ACTIVE_DRIVER_STATUSES.includes(s.status)).length;

  const supabase = await createClient();
  const { data: codRows } = await supabase
    .from('cod_transactions')
    .select('amount')
    .eq('driver_id', driverId)
    .in('status', ['collected', 'reconciled', 'remitted']);

  const codCollected = (codRows ?? []).reduce((sum, row) => sum + row.amount, 0);

  // "Current" is the oldest non-terminal shipment — the one the driver
  // should act on next, whether that's accepting a new assignment or
  // continuing one already in progress.
  const current = shipments
    .filter((s) => !TERMINAL_STATUSES.includes(s.status))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

  return {
    todayCount,
    completedCount,
    pendingCount,
    codCollected,
    currency: shipments[0]?.currency ?? 'AED',
    currentShipmentId: current?.id ?? null,
  };
};
