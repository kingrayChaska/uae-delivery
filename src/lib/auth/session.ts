import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

import type { Profile } from '@/lib/types';

export type Session = {
  signedIn: boolean;
  // Returned even when deactivated, so callers can tell "not signed in"
  // apart from "signed in but deactivated". Use getCurrentProfile() unless
  // you need that distinction.
  profile: Profile | null;
};

// Wrapped in React's cache() so the layout's requireRoleOrRedirect() call
// and a page's own getCurrentProfile()/requireRole() call within the same
// request share one query instead of hitting the DB twice per request.
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();

  // getClaims() verifies the JWT signature locally (asymmetric signing
  // keys), saving an Auth server round trip on every request. The profile
  // query below still hits the DB, so a deactivated account is rejected
  // immediately rather than when its token expires.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (!userId) return { signedIn: false, profile: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, phone, avatar_url, active, account_type, account_type_selected_at, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return { signedIn: true, profile: null };

  return {
    signedIn: true,
    profile: {
      id: profile.id,
      role: profile.role,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      avatarUrl: profile.avatar_url,
      active: profile.active,
      accountType: profile.account_type,
      accountTypeSelectedAt: profile.account_type_selected_at,
      createdAt: profile.created_at,
    },
  };
});

// The signed-in, ACTIVE profile — null for signed-out or deactivated users.
export const getCurrentProfile = async (): Promise<Profile | null> => {
  const { profile } = await getSession();
  return profile?.active ? profile : null;
};
