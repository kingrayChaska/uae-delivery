import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';
import { ACTIVE_STATUSES, countFor, hasFilters, NO_FILTERS, statusesFor } from '@/lib/shipment/filters';

import type { Paginated } from '@/lib/pagination';
import type { ShipmentFilters, StatusCounts } from '@/lib/shipment/filters';
import type { Shipment, ShipmentStatus } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';


export type CustomerDashboardSummary = {
  active: number;
  pending: number;
  completed: number;
  // Shipments per status, for the merchant's status cards.
  byStatus: StatusCounts;
  totalSpent: number;
  currency: string;
  recent: Shipment[];
};

// RLS (shipments_select) already scopes this to the caller's own
// shipments — no explicit customer_id filter needed here, but adding one
// anyway is harmless and makes the query's intent obvious to read.
export const listCustomerShipments = async (
  customerId: string,
  page: number,
  filters: ShipmentFilters = NO_FILTERS,
  // Set for the business-wide list (scope=business): every shipment of this
  // business account, which the database only returns to its members.
  businessAccountId: string | null = null,
): Promise<Paginated<Shipment>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  // Filtered or business-wide: matched and paged in the database
  // (migration 0032), which limits it to the caller's own shipments or to
  // a business account they belong to.
  if (hasFilters(filters) || businessAccountId) {
    const { data, count, error } = await supabase
      .rpc(
        'search_customer_shipments',
        {
          p_query: filters.q || null,
          p_statuses: statusesFor(filters.status),
          p_from: filters.from,
          p_to: filters.to,
          p_business_account_id: businessAccountId,
        },
        { count: 'exact' },
      )
      .select(SHIPMENT_SELECT_COLUMNS)
      .range(from, to);
    if (error) throw new Error(error.message);
    return toPaginated(((data ?? []) as unknown as ShipmentRow[]).map(mapRowToShipment), count ?? 0, page);
  }

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

  const [countsRes, spentRes, recentRes] = await Promise.all([
    // Every status's count in one grouped query (migration 0036), limited
    // to the caller's own shipments in the database.
    supabase.rpc('customer_shipment_status_counts'),
    supabase.from('customer_shipment_stats').select('total_spent, currency').eq('customer_id', customerId).maybeSingle(),
    supabase
      .from('shipments')
      .select(SHIPMENT_SELECT_COLUMNS)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);
  if (countsRes.error) throw new Error(countsRes.error.message);
  const byStatus: StatusCounts = Object.fromEntries(
    ((countsRes.data ?? []) as { status: ShipmentStatus; shipment_count: number | string }[]).map((row) => [
      row.status,
      Number(row.shipment_count),
    ]),
  );

  return {
    // Each card counts the same statuses as the list it opens.
    active: countFor(byStatus, 'active'),
    pending: countFor(byStatus, 'pending_payment'),
    completed: countFor(byStatus, 'delivered'),
    byStatus,
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
