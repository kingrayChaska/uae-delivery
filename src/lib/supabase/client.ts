import { createBrowserClient } from '@supabase/ssr';

export const createClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Not httpOnly: the browser client must read the session cookie for
      // realtime and direct storage uploads. SameSite=Lax + Secure still
      // block cross-site sending and plaintext transport; the strict CSP is
      // what stands between an XSS bug and this cookie.
      cookieOptions: {
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  );
};
