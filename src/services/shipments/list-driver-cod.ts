import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type DriverCodRecord = {
  id: string;
  shipmentId: string;
  trackingNumber: string;
  amount: number;
  currency: string;
  status: string;
  collectedAt: string | null;
};

export const listDriverCodTransactions = async (driverId: string): Promise<DriverCodRecord[]> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('cod_transactions')
    .select('id, shipment_id, amount, status, collected_at, shipments(tracking_number, currency)')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => {
    const shipment = row.shipments as unknown as { tracking_number: string; currency: string } | null;
    return {
      id: row.id,
      shipmentId: row.shipment_id,
      trackingNumber: shipment?.tracking_number ?? '—',
      amount: row.amount,
      currency: shipment?.currency ?? 'AED',
      status: row.status,
      collectedAt: row.collected_at,
    };
  });
};
