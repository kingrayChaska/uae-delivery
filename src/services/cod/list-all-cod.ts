import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';

import type { Paginated } from '@/lib/pagination';

export type CodOverviewRecord = {
  id: string;
  shipmentId: string;
  trackingNumber: string;
  driverName: string;
  amount: number;
  currency: string;
  status: string;
  collectedAt: string | null;
  reconciledAt: string | null;
};

const COD_SELECT =
  'id, shipment_id, amount, status, collected_at, reconciled_at, shipments(tracking_number, currency), profiles!cod_transactions_driver_id_fkey(full_name)';

type CodRow = {
  id: string;
  shipment_id: string;
  amount: number;
  status: string;
  collected_at: string | null;
  reconciled_at: string | null;
  shipments: unknown;
  profiles: unknown;
};

const toRecord = (row: CodRow): CodOverviewRecord => {
  const shipment = row.shipments as { tracking_number: string; currency: string } | null;
  const driver = row.profiles as { full_name: string } | null;

  return {
    id: row.id,
    shipmentId: row.shipment_id,
    trackingNumber: shipment?.tracking_number ?? '—',
    driverName: driver?.full_name ?? '—',
    amount: row.amount,
    currency: shipment?.currency ?? 'AED',
    status: row.status,
    collectedAt: row.collected_at,
    reconciledAt: row.reconciled_at,
  };
};

// PostgREST's default max-rows per response.
const EXPORT_CHUNK = 1000;

// Every row — only for the manager's CSV export. Read in chunks: a single
// request is silently capped at 1,000 rows, which would truncate the export.
export const listAllCodTransactions = async (): Promise<CodOverviewRecord[]> => {
  const supabase = await createClient();
  const rows: CodRow[] = [];

  for (let from = 0; ; from += EXPORT_CHUNK) {
    const { data } = await supabase
      .from('cod_transactions')
      .select(COD_SELECT)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + EXPORT_CHUNK - 1);
    rows.push(...((data ?? []) as CodRow[]));
    if (!data || data.length < EXPORT_CHUNK) break;
  }

  return rows.map(toRecord);
};

export const listCodTransactionsPage = async (page: number): Promise<Paginated<CodOverviewRecord>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const { data, count } = await supabase
    .from('cod_transactions')
    .select(COD_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  return toPaginated(((data ?? []) as CodRow[]).map(toRecord), count ?? 0, page);
};

// Totals per status, summed in the database (cod_status_totals, migration
// 0021) so they cover every transaction, not just the page on screen.
export const getCodTotals = async (): Promise<Record<string, number>> => {
  const supabase = await createClient();
  const { data } = await supabase.from('cod_status_totals').select('status, total');
  return Object.fromEntries((data ?? []).map((row) => [row.status, Number(row.total)]));
};
