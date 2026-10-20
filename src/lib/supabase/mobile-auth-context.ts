import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

// The mobile app has no cookies: it sends its Supabase access token as
// "Authorization: Bearer ...". The /api/mobile/v1 handler (lib/mobile-api)
// opens this scope around the existing server action or service it calls,
// and createClient() (supabase/server.ts) then acts as that token's user
// instead of reading cookies. Everything downstream is unchanged: the
// token is verified by getSession() (signature + expiry), the profile must
// be active, requireRole() still decides, and RLS still applies to every
// query. Outside such a scope — every website request — this returns
// undefined and nothing behaves differently.
const storage = new AsyncLocalStorage<{ accessToken: string }>();

export const runWithMobileAccessToken = <T>(accessToken: string, fn: () => Promise<T>): Promise<T> =>
  storage.run({ accessToken }, fn);

export const getMobileAccessToken = (): string | undefined => storage.getStore()?.accessToken;
