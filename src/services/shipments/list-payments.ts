import 'server-only';

import { createClient } from '@/lib/supabase/server';

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
export const listCustomerPayments = async (customerId: string): Promise<PaymentRecord[]> => {
  const supabase = await createClient();

  const [{ data: payments }, { data: codShipments }] = await Promise.all([
    supabase
      .from('payments')
      .select('id, shipment_id, amount, currency, method, status, created_at, shipments(tracking_number)')
      .eq('customer_id', customerId),
    supabase
      .from('shipments')
      .select('id, tracking_number, price, currency, payment_status, created_at')
      .eq('customer_id', customerId)
      .eq('payment_method', 'cod'),
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

  return [...cardRecords, ...codRecords].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
};
