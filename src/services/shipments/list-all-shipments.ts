import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { Paginated } from '@/lib/pagination';
import type { Shipment } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';

// The dispatch queue is work in hand, not history, so it's normally short —
// this cap only guards against a pathological backlog rendering thousands
// of rows (and markers on the dispatch map) at once.
const DISPATCH_QUEUE_LIMIT = 200;

// RLS (shipments_select) grants staff unrestricted read on this table —
// that's what makes this "all shipments" rather than "my shipments".
export const listAllShipments = async (page: number): Promise<Paginated<Shipment>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const { data, count } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

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
