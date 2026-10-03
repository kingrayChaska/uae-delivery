import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

// A cache shared by every server instance (maps_cache, migration 0026),
// behind each instance's own in-memory cache in google-provider.ts. Used
// for paid Google answers that many requests ask again: resolved CSV
// addresses and driving routes. Best effort only — any failure here is
// logged and treated as a miss, never as an error, so an outage of the
// cache can't block a booking.

const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const readSharedCache = async <T>(key: string): Promise<T | null> => {
  if (!configured()) return null;
  try {
    const { data, error } = await createAdminClient()
      .from('maps_cache')
      .select('value')
      .eq('key', key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.value as T | undefined) ?? null;
  } catch (error) {
    console.warn('Shared maps cache read failed', error instanceof Error ? error.message : error);
    return null;
  }
};

export const writeSharedCache = async (key: string, value: unknown, ttlMs: number): Promise<void> => {
  if (!configured()) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('maps_cache')
      .upsert({ key, value, expires_at: new Date(Date.now() + ttlMs).toISOString() });
    if (error) throw new Error(error.message);
    // Expired entries are cleared now and then, by whoever happens to write.
    if (Math.random() < 0.02) await admin.from('maps_cache').delete().lt('expires_at', new Date().toISOString());
  } catch (error) {
    console.warn('Shared maps cache write failed', error instanceof Error ? error.message : error);
  }
};
