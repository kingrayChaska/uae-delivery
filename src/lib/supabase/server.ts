import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { getMobileAccessToken } from '@/lib/supabase/mobile-auth-context';

// A request from the mobile app (see mobile-auth-context.ts): the anon key
// plus the user's own access token, so RLS sees that user exactly as it
// does a cookie session. No session is stored or refreshed server-side —
// the app refreshes its own token.
const createMobileClient = (accessToken: string) =>
  createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

export const createClient = async () => {
  const mobileAccessToken = getMobileAccessToken();
  if (mobileAccessToken) return createMobileClient(mobileAccessToken);

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from a Server Component — safe to ignore because
            // middleware refreshes the session on every request.
          }
        },
      },
    },
  );
};
