import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { ACTIVE_DRIVER_STATUSES } from '@/services/shipments/list-driver-shipments';

export type ManagerSummary = {
  shipmentsToday: number;
  inProgress: number;
  awaitingDispatch: number;
  failedNeedingAction: number;
  deliveredThisMonth: number;
  codOutstanding: number;
  activeDrivers: number;
  activeOperators: number;
};

export const getManagerSummary = async (): Promise<ManagerSummary> => {
  const supabase = await createClient();
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const count = { count: 'exact' as const, head: true };

  const [today, inProgress, awaiting, failed, delivered, cod, drivers, operators] = await Promise.all([
    supabase.from('shipments').select('id', count).gte('created_at', startOfDay),
    supabase.from('shipments').select('id', count).in('status', ACTIVE_DRIVER_STATUSES),
    supabase.from('shipments').select('id', count).eq('status', 'confirmed').is('driver_id', null),
    supabase.from('shipments').select('id', count).eq('status', 'delivery_failed'),
    supabase.from('shipments').select('id', count).eq('status', 'delivered').gte('updated_at', startOfMonth),
    supabase.from('cod_transactions').select('amount').in('status', ['expected', 'collected']),
    supabase.from('profiles').select('id', count).eq('role', 'driver').eq('active', true),
    supabase.from('profiles').select('id', count).eq('role', 'operator').eq('active', true),
  ]);

  return {
    shipmentsToday: today.count ?? 0,
    inProgress: inProgress.count ?? 0,
    awaitingDispatch: awaiting.count ?? 0,
    failedNeedingAction: failed.count ?? 0,
    deliveredThisMonth: delivered.count ?? 0,
    codOutstanding: (cod.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0),
    activeDrivers: drivers.count ?? 0,
    activeOperators: operators.count ?? 0,
  };
};
