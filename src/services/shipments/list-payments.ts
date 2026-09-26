import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { mergeWindow, paginateMerged } from '@/lib/pagination';

import type { Paginated } from '@/lib/pagination';

export type PaymentRecord = {
  id: string;
  shipmentId: string;
  trackingNumber: string;
  amount: number;
  currency: string;
  method: 'card' | 'cod';
  status: string;
  createdAt: string;
};

// Card payments live in `payments`; COD amounts live on the shipment itself
// (collected by the driver, not paid upfront) — merged here into one list
// so the customer sees a single payment history regardless of method.
export const listCustomerPayments = async (customerId: string, page: number): Promise<Paginated<PaymentRecord>> => {
  const supabase = await createClient();
  const depth = mergeWindow(page);

  const [{ data: payments, count: cardCount }, { data: codShipments, count: codCount }] = await Promise.all([
    supabase
      .from('payments')
      .select('id, shipment_id, amount, currency, method, status, created_at, shipments(tracking_number)', {
        count: 'exact',
      })
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(depth),
    supabase
      .from('shipments')
      .select('id, tracking_number, price, currency, payment_status, created_at', { count: 'exact' })
      .eq('customer_id', customerId)
      .eq('payment_method', 'cod')
      .order('created_at', { ascending: false })
      .limit(depth),
  ]);

  const cardRecords: PaymentRecord[] = (payments ?? []).map((row) => ({
    id: row.id,
    shipmentId: row.shipment_id,
    trackingNumber: (row.shipments as unknown as { tracking_number: string } | null)?.tracking_number ?? '—',
    amount: row.amount,
    currency: row.currency,
    method: 'card',
    status: row.status,
    createdAt: row.created_at,
  }));

  const codRecords: PaymentRecord[] = (codShipments ?? []).map((row) => ({
    id: row.id,
    shipmentId: row.id,
    trackingNumber: row.tracking_number,
    amount: row.price,
    currency: row.currency,
    method: 'cod',
    status: row.payment_status,
    createdAt: row.created_at,
  }));

  return paginateMerged([cardRecords, codRecords], (cardCount ?? 0) + (codCount ?? 0), page);
};
