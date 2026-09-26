import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/security/validate';
import { pageRange, toPaginated } from '@/lib/pagination';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { Paginated } from '@/lib/pagination';
import type { BatchProgress, BatchStatus } from '@/lib/bulk/schemas';
import type { Shipment } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';

export type BatchSummary = {
  id: string;
  reference: string;
  name: string;
  status: BatchStatus;
  pickupDate: string | null;
  notes: string;
  createdAt: string;
  rowsSubmitted: number;
  rowsFailed: number;
  customer: { id: string; fullName: string; email: string; phone: string };
  companyName: string | null;
  shipmentCount: number;
  parcelCount: number;
  totalPrice: number;
  currency: string;
  progress: BatchProgress;
};

export type BatchDetail = BatchSummary & {
  failedRows: { rowNumber: number; message: string }[];
  shipments: Shipment[];
};

type BatchRow = {
  id: string;
  reference: string;
  name: string;
  status: BatchStatus;
  pickup_date: string | null;
  notes: string;
  created_at: string;
  rows_submitted: number;
  rows_failed: number;
  failed_rows: unknown;
  customer_id: string;
  customer: { full_name: string; email: string; phone: string } | null;
  business: { company_name: string } | null;
};

// Per-batch counts and totals, aggregated in the database (migration 0021).
type BatchStatsRow = {
  batch_id: string;
  shipment_count: number;
  parcel_count: number;
  total_price: number;
  currency: string | null;
  awaiting_dispatch: number;
  in_progress: number;
  delivered: number;
  issues: number;
};

const BATCH_SELECT =
  'id, reference, name, status, pickup_date, notes, created_at, rows_submitted, rows_failed, failed_rows, customer_id, customer:profiles!shipment_batches_customer_id_fkey(full_name, email, phone), business:business_accounts(company_name)';

const STATS_SELECT =
  'batch_id, shipment_count, parcel_count, total_price, currency, awaiting_dispatch, in_progress, delivered, issues';

const toSummary = (row: BatchRow, stats: BatchStatsRow | undefined): BatchSummary => ({
  id: row.id,
  reference: row.reference,
  name: row.name,
  status: row.status,
  pickupDate: row.pickup_date,
  notes: row.notes,
  createdAt: row.created_at,
  rowsSubmitted: row.rows_submitted,
  rowsFailed: row.rows_failed,
  customer: {
    id: row.customer_id,
    fullName: row.customer?.full_name ?? 'Unknown customer',
    email: row.customer?.email ?? '',
    phone: row.customer?.phone ?? '',
  },
  companyName: row.business?.company_name ?? null,
  shipmentCount: stats?.shipment_count ?? 0,
  parcelCount: stats?.parcel_count ?? 0,
  totalPrice: Number(stats?.total_price ?? 0),
  currency: stats?.currency ?? 'AED',
  progress: {
    awaitingDispatch: stats?.awaiting_dispatch ?? 0,
    inProgress: stats?.in_progress ?? 0,
    delivered: stats?.delivered ?? 0,
    issues: stats?.issues ?? 0,
  },
});

const withStats = async (batches: BatchRow[]): Promise<BatchSummary[]> => {
  if (batches.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('batch_shipment_stats')
    .select(STATS_SELECT)
    .in(
      'batch_id',
      batches.map((b) => b.id),
    );
  const byBatch = new Map(((data ?? []) as BatchStatsRow[]).map((row) => [row.batch_id, row]));
  return batches.map((batch) => toSummary(batch, byBatch.get(batch.id)));
};

// Visibility is RLS's job (shipment_batches_select, migration 0020): a
// customer gets their own and their business's lists, staff get every list.

// The few most recent lists, for dashboard home pages.
export const listRecentBatches = async (limit: number): Promise<BatchSummary[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('shipment_batches')
    .select(BATCH_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  return withStats((data ?? []) as unknown as BatchRow[]);
};

export const listBatches = async (page: number): Promise<Paginated<BatchSummary>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);
  const { data, count } = await supabase
    .from('shipment_batches')
    .select(BATCH_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  return toPaginated(await withStats((data ?? []) as unknown as BatchRow[]), count ?? 0, page);
};

// A list holds at most BULK_MAX_ROWS shipments, so the detail page shows
// all of them. The batch and its shipments are read in parallel.
export const getBatchDetail = async (batchId: string): Promise<BatchDetail | null> => {
  if (!isUuid(batchId)) return null;
  const supabase = await createClient();

  const [{ data }, { data: stats }, { data: shipmentRows }] = await Promise.all([
    supabase.from('shipment_batches').select(BATCH_SELECT).eq('id', batchId).maybeSingle(),
    supabase.from('batch_shipment_stats').select(STATS_SELECT).eq('batch_id', batchId).maybeSingle(),
    supabase
      .from('shipments')
      .select(SHIPMENT_SELECT_COLUMNS)
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true }),
  ]);
  if (!data) return null;

  const batch = data as unknown as BatchRow;
  const failedRows = Array.isArray(batch.failed_rows)
    ? (batch.failed_rows as { rowNumber: number; message: string }[])
    : [];

  return {
    ...toSummary(batch, (stats ?? undefined) as BatchStatsRow | undefined),
    failedRows,
    shipments: ((shipmentRows ?? []) as ShipmentRow[]).map(mapRowToShipment),
  };
};

// Across every list, not just the page on screen. Only lists that still
// have parcels waiting are returned, so this stays small.
export const getBatchDispatchBacklog = async (): Promise<{ lists: number; shipments: number }> => {
  const supabase = await createClient();
  const { data } = await supabase.from('batch_shipment_stats').select('awaiting_dispatch').gt('awaiting_dispatch', 0);
  const rows = data ?? [];
  return { lists: rows.length, shipments: rows.reduce((sum, row) => sum + (row.awaiting_dispatch as number), 0) };
};
