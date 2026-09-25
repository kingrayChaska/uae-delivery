import 'server-only';

import { getCurrentProfile } from '@/lib/auth/session';

import type { Profile, Role } from '@/lib/types';

export class AuthError extends Error {
  constructor(message = 'Not authenticated') {
    super(message);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Not authorized') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

// Call this at the top of every server action / route handler that needs
// a signed-in user. Throws instead of returning null so callers can't
// accidentally skip the check.
export const requireUser = async (): Promise<Profile> => {
  const profile = await getCurrentProfile();
  if (!profile) throw new AuthError();
  return profile;
};

// Call this wherever a server action / route handler is restricted to
// specific roles. This — not any client-supplied role field — is the
// real authorization boundary for the app.
export const requireRole = async (...allowedRoles: Role[]): Promise<Profile> => {
  const profile = await requireUser();
  if (!allowedRoles.includes(profile.role)) throw new ForbiddenError();
  return profile;
};
