import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { ACTIVE_DRIVER_STATUSES } from '@/services/shipments/list-driver-shipments';

export type OperationsSummary = {
  awaitingDispatch: number;
  inProgress: number;
  failedNeedingAction: number;
  codAwaitingReconciliation: number;
};

export const getOperationsSummary = async (): Promise<OperationsSummary> => {
  const supabase = await createClient();

  const [awaiting, inProgress, failed, cod] = await Promise.all([
    supabase.from('shipments').select('id', { count: 'exact', head: true }).eq('status', 'confirmed').is('driver_id', null),
    supabase.from('shipments').select('id', { count: 'exact', head: true }).in('status', ACTIVE_DRIVER_STATUSES),
    supabase.from('shipments').select('id', { count: 'exact', head: true }).eq('status', 'delivery_failed'),
    supabase.from('cod_transactions').select('id', { count: 'exact', head: true }).eq('status', 'collected'),
  ]);

  return {
    awaitingDispatch: awaiting.count ?? 0,
    inProgress: inProgress.count ?? 0,
    failedNeedingAction: failed.count ?? 0,
    codAwaitingReconciliation: cod.count ?? 0,
  };
};
