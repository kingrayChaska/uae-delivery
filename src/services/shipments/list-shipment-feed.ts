import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';
import { listBatchSummariesByIds } from '@/services/bulk/list-batches';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { Paginated } from '@/lib/pagination';
import type { ShipmentCategory } from '@/lib/shipment/categories';
import type { Shipment } from '@/lib/types';
import type { BatchSummary } from '@/services/bulk/list-batches';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';

export type ShipmentFeedItem = { kind: 'shipment'; shipment: Shipment } | { kind: 'batch'; batch: BatchSummary };

type FeedRow = { kind: 'shipment' | 'batch'; id: string };

// One page of staff_shipment_feed (migration 0030): single shipments, and
// each batch once, newest first. The page is chosen in the database; then
// its shipments and batches are loaded by id — three queries per page,
// whatever its mix. Throws when the list can't be read, so the page can
// say so instead of showing an empty list.
export const listShipmentFeed = async (page: number, category: ShipmentCategory): Promise<Paginated<ShipmentFeedItem>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  let query = supabase.from('staff_shipment_feed').select('kind, id', { count: 'exact' });
  if (category === 'bulk') query = query.eq('kind', 'batch');
  else if (category !== 'all') query = query.eq('account_type', category);

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as FeedRow[];
  const shipmentIds = rows.filter((row) => row.kind === 'shipment').map((row) => row.id);
  const batchIds = rows.filter((row) => row.kind === 'batch').map((row) => row.id);

  const [shipmentResult, batches] = await Promise.all([
    shipmentIds.length
      ? supabase.from('shipments').select(SHIPMENT_SELECT_COLUMNS).in('id', shipmentIds)
      : Promise.resolve({ data: [] as ShipmentRow[], error: null }),
    listBatchSummariesByIds(batchIds),
  ]);
  if (shipmentResult.error) throw new Error(shipmentResult.error.message);

  const shipmentsById = new Map(((shipmentResult.data ?? []) as ShipmentRow[]).map((row) => [row.id, mapRowToShipment(row)]));
  const batchesById = new Map(batches.map((batch) => [batch.id, batch]));

  const items = rows.flatMap((row): ShipmentFeedItem[] => {
    if (row.kind === 'batch') {
      const batch = batchesById.get(row.id);
      return batch ? [{ kind: 'batch', batch }] : [];
    }
    const shipment = shipmentsById.get(row.id);
    return shipment ? [{ kind: 'shipment', shipment }] : [];
  });

  return toPaginated(items, count ?? 0, page);
};
