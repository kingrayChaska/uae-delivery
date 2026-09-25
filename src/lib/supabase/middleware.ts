import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

import { decideRoute } from '@/lib/auth/route-access';

import type { RouteProfile } from '@/lib/auth/route-access';
import type { Role } from '@/lib/types';
import type { NextRequest } from 'next/server';

// This is defense-in-depth only: it improves UX by redirecting people to
// where they belong before a page even renders. It is NOT the security
// boundary — every server action, route handler and RLS policy re-checks
// the caller's role independently (see lib/auth and database/migrations).
// Supabase stores the session in cookies named sb-<project-ref>-auth-token
// (split into .0/.1 chunks when large).
const hasAuthCookie = (request: NextRequest) =>
  request.cookies.getAll().some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'));

export const updateSession = async (request: NextRequest) => {
  let response = NextResponse.next({ request });

  // No session cookie means nobody is signed in, so there's nothing to
  // refresh or verify. Skipping the Supabase client here keeps anonymous
  // visits (the marketing site, tracking) free of any network round trip.
  if (!hasAuthCookie(request)) {
    const decision = decideRoute({ pathname: request.nextUrl.pathname, signedIn: false, profile: null });
    return decision.type === 'redirect' ? NextResponse.redirect(new URL(decision.to, request.url)) : response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getClaims() verifies the JWT signature locally against the project's
  // cached public key (asymmetric signing keys), refreshing the session
  // first if it has expired — unlike getUser(), which calls the Auth server
  // on every request.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub ?? null;

  const { pathname } = request.nextUrl;
  const needsProfile =
    Boolean(userId) && (pathname.startsWith('/dashboard') || pathname === '/login' || pathname === '/register');

  let profile: RouteProfile = null;
  if (userId && needsProfile) {
    const { data } = await supabase.from('profiles').select('role, active').eq('id', userId).maybeSingle();
    profile = data ? { role: data.role as Role, active: data.active } : null;
  }

  const decision = decideRoute({ pathname, signedIn: Boolean(userId), profile });
  if (decision.type === 'redirect') {
    const redirectResponse = NextResponse.redirect(new URL(decision.to, request.url));
    // Carry over any refreshed session cookies set during getClaims().
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
};
