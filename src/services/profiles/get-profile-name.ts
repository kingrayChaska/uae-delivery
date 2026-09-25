import 'server-only';

import { createClient } from '@/lib/supabase/server';

// profiles_select RLS lets staff read any profile — used for showing a
// driver's name on the operator/manager shipment detail page.
export const getProfileName = async (profileId: string | null): Promise<string | null> => {
  if (!profileId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('full_name').eq('id', profileId).maybeSingle();
  return data?.full_name ?? null;
};
