import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { AccountType } from '@/lib/types';

// profiles_select RLS lets staff read any profile — used for showing a
// driver's name on the operator/manager shipment detail page.
export const getProfileName = async (profileId: string | null): Promise<string | null> => {
  if (!profileId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('full_name').eq('id', profileId).maybeSingle();
  return data?.full_name ?? null;
};

// Individual or merchant: what the operator's price dialog shows next to the
// customer's name.
export const getProfileAccountType = async (profileId: string | null): Promise<AccountType | null> => {
  if (!profileId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('account_type').eq('id', profileId).maybeSingle();
  return (data?.account_type as AccountType | undefined) ?? null;
};
