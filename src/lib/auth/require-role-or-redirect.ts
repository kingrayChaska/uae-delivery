import 'server-only';

import { redirect } from 'next/navigation';

import { getCurrentProfile } from '@/lib/auth/session';

import type { Profile, Role } from '@/lib/types';

// Use in dashboard layouts/pages (Server Components), where throwing isn't
// appropriate. Server actions and route handlers should use requireRole
// from lib/auth/guards instead, which throws so the caller can return a
// proper error response.
export const requireRoleOrRedirect = async (...allowedRoles: Role[]): Promise<Profile> => {
  const profile = await getCurrentProfile();

  if (!profile) redirect('/login');
  if (!allowedRoles.includes(profile.role)) redirect('/login');

  return profile;
};
