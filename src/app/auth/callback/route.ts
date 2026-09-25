import { NextResponse } from 'next/server';

import { publicUrl } from '@/lib/auth/public-url';

import { DASHBOARD_HOME } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';

import type { Role } from '@/lib/types';
import type { NextRequest } from 'next/server';

export const GET = async (request: NextRequest) => {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Supabase sends `type=recovery` for password-reset links so we can route
  // to the reset-password form instead of straight into the dashboard.
  const type = searchParams.get('type');

  if (!code) {
    return NextResponse.redirect(publicUrl(`/login`, origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(publicUrl(`/login?error=invalid_link`, origin));
  }

  if (type === 'recovery' || type === 'invite') {
    return NextResponse.redirect(publicUrl(`/reset-password`, origin));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  const destination = profile ? DASHBOARD_HOME[profile.role as Role] : '/login';
  return NextResponse.redirect(publicUrl(`${destination}`, origin));
};
