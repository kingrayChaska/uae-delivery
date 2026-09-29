import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { Paginated } from '@/lib/pagination';
import type { Shipment } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';

const ACTIVE_STATUSES = [
  'confirmed',
  'assigned',
  'driver_accepted',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
];

export type CustomerDashboardSummary = {
  active: number;
  pending: number;
  completed: number;
  totalSpent: number;
  currency: string;
  recent: Shipment[];
};

// RLS (shipments_select) already scopes this to the caller's own
// shipments — no explicit customer_id filter needed here, but adding one
// anyway is harmless and makes the query's intent obvious to read.
export const listCustomerShipments = async (customerId: string, page: number): Promise<Paginated<Shipment>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const { data, count } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS, { count: 'exact' })
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .range(from, to);

  return toPaginated(((data ?? []) as ShipmentRow[]).map(mapRowToShipment), count ?? 0, page);
};

export const getCustomerDashboardSummary = async (customerId: string): Promise<CustomerDashboardSummary> => {
  const supabase = await createClient();

  const [activeRes, pendingRes, completedRes, spentRes, recentRes] = await Promise.all([
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .in('status', ACTIVE_STATUSES),
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('status', 'pending_payment'),
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('status', 'delivered'),
    supabase.from('customer_shipment_stats').select('total_spent, currency').eq('customer_id', customerId).maybeSingle(),
    supabase
      .from('shipments')
      .select(SHIPMENT_SELECT_COLUMNS)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  return {
    active: activeRes.count ?? 0,
    pending: pendingRes.count ?? 0,
    completed: completedRes.count ?? 0,
    // Summed in the database (customer_shipment_stats, migration 0021)
    // rather than by downloading every paid shipment.
    totalSpent: Number(spentRes.data?.total_spent ?? 0),
    currency: spentRes.data?.currency ?? 'AED',
    recent: ((recentRes.data ?? []) as ShipmentRow[]).map(mapRowToShipment),
  };
};

export type CustomerBooking = { reference: string; createdAt: string; shipments: Shipment[] };

// One multi-shipment booking (a shipment_batches row) and its shipments.
// RLS (shipment_batches_select / shipments_select) limits this to the
// customer's own bookings.
export const getCustomerBooking = async (customerId: string, batchId: string): Promise<CustomerBooking | null> => {
  const supabase = await createClient();
  const [{ data: batch }, { data: rows }] = await Promise.all([
    supabase.from('shipment_batches').select('reference, created_at').eq('id', batchId).eq('customer_id', customerId).maybeSingle(),
    supabase
      .from('shipments')
      .select(SHIPMENT_SELECT_COLUMNS)
      .eq('batch_id', batchId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true }),
  ]);
  if (!batch) return null;
  return {
    reference: batch.reference,
    createdAt: batch.created_at,
    shipments: ((rows ?? []) as ShipmentRow[]).map(mapRowToShipment),
  };
};

// Shipments still on their way, for the dashboard's tracking view.
export const listCustomerActiveShipments = async (customerId: string, limit = 20): Promise<Shipment[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS)
    .eq('customer_id', customerId)
    .in('status', ['pending_payment', ...ACTIVE_STATUSES])
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as ShipmentRow[]).map(mapRowToShipment);
};
