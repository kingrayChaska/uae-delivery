import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';
import { statusesFor } from '@/lib/shipment/filters';

import type { Paginated } from '@/lib/pagination';
import type { ShipmentCategory } from '@/lib/shipment/categories';
import type { ShipmentFilters } from '@/lib/shipment/filters';
import type { Shipment } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';

// The dispatch queue is work in hand, not history, so it's normally short —
// this cap only guards against a pathological backlog rendering thousands
// of rows (and markers on the dispatch map) at once.
const DISPATCH_QUEUE_LIMIT = 200;

// RLS (shipments_select) grants staff unrestricted read on this table —
// that's what makes this "all shipments" rather than "my shipments".
// `batchId` narrows it to one bulk batch (the staff shipments list's filter).
export const listAllShipments = async (page: number, { batchId = null }: { batchId?: string | null } = {}): Promise<Paginated<Shipment>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  let query = supabase.from('shipments').select(SHIPMENT_SELECT_COLUMNS, { count: 'exact' });
  if (batchId) query = query.eq('batch_id', batchId);
  const { data, count } = await query.order('created_at', { ascending: false }).range(from, to);

  return toPaginated(((data ?? []) as ShipmentRow[]).map(mapRowToShipment), count ?? 0, page);
};

export const listUnassignedShipments = async (): Promise<Shipment[]> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS)
    .eq('status', 'confirmed')
    .is('driver_id', null)
    .order('created_at', { ascending: true })
    .limit(DISPATCH_QUEUE_LIMIT);

  return ((data ?? []) as ShipmentRow[]).map(mapRowToShipment);
};

// The staff Shipments list's search (search_staff_shipments, migration
// 0038): every shipment matching the filters, one by one — a bulk
// booking's shipments included individually — matched and paged in the
// database. The tab narrows it: Individual / Merchant by the booking
// customer's account type, Bulk to bulk-booked shipments, and ?batch= to
// one bulk booking. Staff only (the database checks). Throws when the
// search can't run, so the page can say so instead of showing no results.
export const searchStaffShipments = async (
  page: number,
  filters: ShipmentFilters,
  { category = 'all', batchId = null }: { category?: ShipmentCategory; batchId?: string | null } = {},
): Promise<Paginated<Shipment>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const { data, count, error } = await supabase
    .rpc(
      'search_staff_shipments',
      {
        p_query: filters.q || null,
        p_statuses: statusesFor(filters.status),
        p_from: filters.from,
        p_to: filters.to,
        p_account_type: category === 'individual' || category === 'merchant' ? category : null,
        p_bulk_only: category === 'bulk',
        p_batch_id: batchId,
      },
      { count: 'exact' },
    )
    .select(SHIPMENT_SELECT_COLUMNS)
    .range(from, to);
  // A page past the last match (an old link, fewer matches now): no rows,
  // so the page can send the user back to page 1.
  if (error?.code === 'PGRST103') return toPaginated([], 0, page);
  if (error) throw new Error(error.message);
  return toPaginated(((data ?? []) as unknown as ShipmentRow[]).map(mapRowToShipment), count ?? 0, page);
};
