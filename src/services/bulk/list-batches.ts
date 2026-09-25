import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/security/validate';
import { summarizeBatchProgress } from '@/lib/bulk/schemas';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { BatchProgress, BatchStatus } from '@/lib/bulk/schemas';
import type { Shipment, ShipmentStatus } from '@/lib/types';
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

const BATCH_SELECT =
  'id, reference, name, status, pickup_date, notes, created_at, rows_submitted, rows_failed, failed_rows, customer_id, customer:profiles!shipment_batches_customer_id_fkey(full_name, email, phone), business:business_accounts(company_name)';

type ShipmentTotalsRow = {
  batch_id: string;
  status: ShipmentStatus;
  price: number;
  currency: string;
  package_quantity: number;
};

const toSummary = (row: BatchRow, shipments: ShipmentTotalsRow[]): BatchSummary => ({
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
  shipmentCount: shipments.length,
  parcelCount: shipments.reduce((sum, s) => sum + s.package_quantity, 0),
  totalPrice: shipments.reduce((sum, s) => sum + Number(s.price), 0),
  currency: shipments[0]?.currency ?? 'AED',
  progress: summarizeBatchProgress(shipments.map((s) => s.status)),
});

// Visibility is RLS's job (shipment_batches_select, migration 0020): a
// customer gets their own and their business's lists, staff get every list.
// customerId narrows a staff query to one customer; it isn't a security
// boundary.
export const listBatches = async ({ customerId, limit }: { customerId?: string; limit?: number } = {}): Promise<
  BatchSummary[]
> => {
  const supabase = await createClient();

  let query = supabase.from('shipment_batches').select(BATCH_SELECT).order('created_at', { ascending: false });
  if (customerId) query = query.eq('customer_id', customerId);
  if (limit) query = query.limit(limit);

  const { data } = await query;
  const batches = (data ?? []) as unknown as BatchRow[];
  if (batches.length === 0) return [];

  const { data: shipments } = await supabase
    .from('shipments')
    .select('batch_id, status, price, currency, package_quantity')
    .in(
      'batch_id',
      batches.map((b) => b.id),
    );
  const rows = (shipments ?? []) as ShipmentTotalsRow[];

  return batches.map((batch) => toSummary(batch, rows.filter((s) => s.batch_id === batch.id)));
};

export const getBatchDetail = async (batchId: string): Promise<BatchDetail | null> => {
  if (!isUuid(batchId)) return null;
  const supabase = await createClient();

  const { data } = await supabase.from('shipment_batches').select(BATCH_SELECT).eq('id', batchId).maybeSingle();
  if (!data) return null;
  const batch = data as unknown as BatchRow;

  const { data: shipmentRows } = await supabase
    .from('shipments')
    .select(`${SHIPMENT_SELECT_COLUMNS}, batch_id`)
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });

  const rows = (shipmentRows ?? []) as unknown as (ShipmentRow & { batch_id: string })[];
  const failedRows = Array.isArray(batch.failed_rows)
    ? (batch.failed_rows as { rowNumber: number; message: string }[])
    : [];

  return {
    ...toSummary(
      batch,
      rows.map((r) => ({
        batch_id: r.batch_id,
        status: r.status,
        price: r.price,
        currency: r.currency,
        package_quantity: r.package_quantity,
      })),
    ),
    failedRows,
    shipments: rows.map(mapRowToShipment),
  };
};
