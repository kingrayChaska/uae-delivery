import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

import type { Profile } from '@/lib/types';

// Wrapped in React's cache() so the layout's requireRoleOrRedirect() call
// and a page's own getCurrentProfile()/requireRole() call within the same
// request share one query instead of hitting the DB twice per request.
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  // getClaims() verifies the JWT signature locally (asymmetric signing
  // keys), saving an Auth server round trip on every request. The profile
  // query below still hits the DB, so a deactivated account is rejected
  // immediately rather than when its token expires.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (!userId) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, phone, avatar_url, active, created_at')
    .eq('id', userId)
    .single();

  if (!profile || !profile.active) return null;

  return {
    id: profile.id,
    role: profile.role,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
    active: profile.active,
    createdAt: profile.created_at,
  };
});
