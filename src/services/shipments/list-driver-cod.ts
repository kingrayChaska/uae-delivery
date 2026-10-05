import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';

import type { Paginated } from '@/lib/pagination';

export type DriverCodRecord = {
  id: string;
  shipmentId: string;
  trackingNumber: string;
  // amount = productAmount (from the recipient) + deliveryFeeAmount (the
  // sender's cash fee), as in list-all-cod.ts.
  amount: number;
  productAmount: number;
  deliveryFeeAmount: number;
  currency: string;
  status: string;
  collectedAt: string | null;
};

export const listDriverCodTransactions = async (driverId: string, page: number): Promise<Paginated<DriverCodRecord>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const { data, count } = await supabase
    .from('cod_transactions')
    .select('id, shipment_id, amount, product_amount, delivery_fee_amount, status, collected_at, shipments(tracking_number, currency)', {
      count: 'exact',
    })
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const items = (data ?? []).map((row) => {
    const shipment = row.shipments as unknown as { tracking_number: string; currency: string } | null;
    return {
      id: row.id,
      shipmentId: row.shipment_id,
      trackingNumber: shipment?.tracking_number ?? '—',
      amount: Number(row.amount),
      productAmount: Number(row.product_amount),
      deliveryFeeAmount: Number(row.delivery_fee_amount),
      currency: shipment?.currency ?? 'AED',
      status: row.status,
      collectedAt: row.collected_at,
    };
  });

  return toPaginated(items, count ?? 0, page);
};
