import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { mergeWindow, paginateMerged } from '@/lib/pagination';

import type { Paginated } from '@/lib/pagination';

export type PaymentOverviewRecord = {
  id: string;
  shipmentId: string;
  trackingNumber: string;
  customerName: string;
  method: 'card' | 'cod';
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
};

// Card payments come from the payments table (empty until a provider is
// wired up — see lib/payments). COD is represented by the shipment itself,
// same as the customer-facing payments page, so both show in one ledger.
export const listAllPayments = async (page: number): Promise<Paginated<PaymentOverviewRecord>> => {
  const supabase = await createClient();
  const depth = mergeWindow(page);

  const [{ data: payments, count: cardCount }, { data: codShipments, count: codCount }] = await Promise.all([
    supabase
      .from('payments')
      .select('id, shipment_id, amount, currency, status, created_at, shipments(tracking_number), profiles!customer_id(full_name)', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .limit(depth),
    supabase
      .from('shipments')
      .select('id, tracking_number, price, currency, status, created_at, guest_customer_name, profiles!customer_id(full_name)', {
        count: 'exact',
      })
      .eq('payment_method', 'cod')
      .order('created_at', { ascending: false })
      .limit(depth),
  ]);

  const card: PaymentOverviewRecord[] = (payments ?? []).map((row) => ({
    id: row.id,
    shipmentId: row.shipment_id,
    trackingNumber: (row.shipments as unknown as { tracking_number: string } | null)?.tracking_number ?? '—',
    customerName: (row.profiles as unknown as { full_name: string } | null)?.full_name ?? '—',
    method: 'card',
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  }));

  const cod: PaymentOverviewRecord[] = (codShipments ?? []).map((row) => ({
    id: row.id,
    shipmentId: row.id,
    trackingNumber: row.tracking_number,
    // A booking for a customer without an account (migration 0040) carries their name.
    customerName:
      (row.profiles as unknown as { full_name: string } | null)?.full_name ?? row.guest_customer_name ?? '—',
    method: 'cod',
    amount: Number(row.price),
    currency: row.currency,
    status: row.status === 'delivered' ? 'collected on delivery' : row.status === 'cancelled' ? 'cancelled' : 'due on delivery',
    createdAt: row.created_at,
  }));

  return paginateMerged([card, cod], (cardCount ?? 0) + (codCount ?? 0), page);
};
