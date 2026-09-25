import 'server-only';

import { createClient } from '@/lib/supabase/server';

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

export const listAllCodTransactions = async (): Promise<CodOverviewRecord[]> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('cod_transactions')
    .select(
      'id, shipment_id, amount, status, collected_at, reconciled_at, shipments(tracking_number, currency), profiles!cod_transactions_driver_id_fkey(full_name)',
    )
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => {
    const shipment = row.shipments as unknown as { tracking_number: string; currency: string } | null;
    const driver = row.profiles as unknown as { full_name: string } | null;

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
  });
};
