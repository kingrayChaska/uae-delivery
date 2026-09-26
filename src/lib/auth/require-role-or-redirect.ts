import 'server-only';

import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';
import { DASHBOARD_HOME } from '@/lib/types';

import type { Profile, Role } from '@/lib/types';

// Use in dashboard layouts/pages (Server Components), where throwing isn't
// appropriate. Server actions and route handlers should use requireRole
// from lib/auth/guards instead, which throws so the caller can return a
// proper error response.
//
// This is also where a signed-in user is sent to the right dashboard: the
// proxy skips its own profile lookup for /dashboard/<role>/... paths (see
// routeNeedsProfile), so the redirects here mirror decideRoute's.
export const requireRoleOrRedirect = async (...allowedRoles: Role[]): Promise<Profile> => {
  const { signedIn, profile } = await getSession();

  if (!signedIn) redirect('/login');
  if (!profile || !profile.active) redirect('/login?error=inactive');
  if (!allowedRoles.includes(profile.role)) redirect(DASHBOARD_HOME[profile.role]);

  return profile;
};
