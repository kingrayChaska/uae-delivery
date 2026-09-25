import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Uses the service role key — bypasses Row Level Security entirely.
// Import ONLY from server actions / route handlers that have already
// verified the caller's role server-side (see lib/auth). Never import
// this from a Client Component or expose SUPABASE_SERVICE_ROLE_KEY
// to the browser bundle.
export const createAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
};
