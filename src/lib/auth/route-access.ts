import { DASHBOARD_HOME, ROLES } from '@/lib/types';

import type { Role } from '@/lib/types';

// Pure routing decision used by the proxy (lib/supabase/middleware.ts), kept
// separate so every role x area combination is unit tested. This is UX —
// the security boundary is still requireRole() in every page/action plus RLS.

const PUBLIC_ROUTES = ['/', '/tracking', '/login', '/register', '/forgot-password', '/reset-password', '/privacy', '/terms'];

export const isPublicRoute = (pathname: string) =>
  PUBLIC_ROUTES.includes(pathname) || pathname.startsWith('/auth/') || pathname.startsWith('/tracking/');

export type RouteProfile = { role: Role; active: boolean } | null;

export type RouteDecision = { type: 'allow' } | { type: 'redirect'; to: string };

const allow: RouteDecision = { type: 'allow' };
const redirect = (to: string): RouteDecision => ({ type: 'redirect', to });

export const decideRoute = ({
  pathname,
  signedIn,
  profile,
}: {
  pathname: string;
  signedIn: boolean;
  profile: RouteProfile;
}): RouteDecision => {
  if (!signedIn) {
    return isPublicRoute(pathname) ? allow : redirect(`/login?redirectTo=${encodeURIComponent(pathname)}`);
  }

  // An inactive profile (deactivated by a manager, or a missing profile)
  // may still hold an unexpired session. It gets the public site and the
  // login page — never a dashboard — and /login must NOT bounce it back to
  // a dashboard, or the two redirects loop forever.
  const usable = profile !== null && profile.active;

  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    if (!usable) return redirect('/login?error=inactive');
    const requestedRole = pathname.split('/')[2];
    if (!(ROLES as readonly string[]).includes(requestedRole ?? '') || requestedRole !== profile.role) {
      return redirect(DASHBOARD_HOME[profile.role]);
    }
    return allow;
  }

  if ((pathname === '/login' || pathname === '/register') && usable) {
    return redirect(DASHBOARD_HOME[profile.role]);
  }

  // Everything else (public pages, /api/* handlers that do their own role
  // checks) is allowed for signed-in users.
  return allow;
};
