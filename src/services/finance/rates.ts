import 'server-only';

import { createClient } from '@/lib/supabase/server';

// The return-charge / cash-handling rate history (migration 0045). Managers
// only — RLS returns nothing to anyone else. Newest first.

export type FinancialRate = {
  id: string;
  effectiveFrom: string;
  returnChargeRate: number;
  cashHandlingRate: number;
  note: string | null;
};

export const listFinancialRates = async (): Promise<FinancialRate[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('financial_rates')
    .select('id, effective_from, return_charge_rate, cash_handling_rate, note')
    .order('effective_from', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; effective_from: string; return_charge_rate: number | string; cash_handling_rate: number | string; note: string | null }[]).map(
    (row) => ({
      id: row.id,
      effectiveFrom: row.effective_from,
      returnChargeRate: Number(row.return_charge_rate),
      cashHandlingRate: Number(row.cash_handling_rate),
      note: row.note,
    }),
  );
};
