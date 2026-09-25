import { NextResponse } from 'next/server';

import { publicUrl } from '@/lib/auth/public-url';

import { DASHBOARD_HOME } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';

import type { EmailOtpType } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import type { Role } from '@/lib/types';

const ALLOWED_TYPES: EmailOtpType[] = ['signup', 'invite', 'recovery', 'email', 'email_change'];

// Server-side token_hash verification — Supabase's recommended pattern for
// SSR apps. Staff invites (admin.inviteUserByEmail) and password resets
// land here once the Supabase email templates point at
// {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>
// (see README "Supabase email templates"). /auth/callback still handles
// the ?code= (PKCE) flow used by self-registration.
export const GET = async (request: NextRequest) => {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  if (!tokenHash || !type || !ALLOWED_TYPES.includes(type)) {
    return NextResponse.redirect(publicUrl(`/login?error=invalid_link`, origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error || !data.user) {
    return NextResponse.redirect(publicUrl(`/login?error=invalid_link`, origin));
  }

  // Invited staff and password resets both need to choose a password.
  if (type === 'invite' || type === 'recovery') {
    return NextResponse.redirect(publicUrl(`/reset-password`, origin));
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
  const destination = profile ? DASHBOARD_HOME[profile.role as Role] : '/login';
  return NextResponse.redirect(publicUrl(`${destination}`, origin));
};
