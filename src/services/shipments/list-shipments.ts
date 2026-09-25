import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

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
export const listCustomerShipments = async (customerId: string): Promise<Shipment[]> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  return ((data ?? []) as ShipmentRow[]).map(mapRowToShipment);
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
    supabase
      .from('shipments')
      .select('price, currency')
      .eq('customer_id', customerId)
      .or('payment_status.eq.paid,and(payment_method.eq.cod,status.eq.delivered)'),
    supabase
      .from('shipments')
      .select(SHIPMENT_SELECT_COLUMNS)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const totalSpent = ((spentRes.data ?? []) as { price: number; currency: string }[]).reduce(
    (sum, s) => sum + s.price,
    0,
  );
  const currency = (spentRes.data as { price: number; currency: string }[] | null)?.[0]?.currency ?? 'AED';

  return {
    active: activeRes.count ?? 0,
    pending: pendingRes.count ?? 0,
    completed: completedRes.count ?? 0,
    totalSpent,
    currency,
    recent: ((recentRes.data ?? []) as ShipmentRow[]).map(mapRowToShipment),
  };
};
