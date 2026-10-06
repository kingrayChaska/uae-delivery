import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getClientIp } from '@/lib/security/request-context';

// Limits are defined in one place so they can be reviewed together.
export const RATE_LIMITS = {
  loginPerIp: { max: 20, windowSeconds: 15 * 60 },
  loginPerEmail: { max: 5, windowSeconds: 15 * 60 },
  registerPerIp: { max: 5, windowSeconds: 60 * 60 },
  passwordResetPerIp: { max: 5, windowSeconds: 60 * 60 },
  passwordResetPerEmail: { max: 3, windowSeconds: 60 * 60 },
  passwordUpdatePerUser: { max: 5, windowSeconds: 15 * 60 },
  trackingPerIp: { max: 30, windowSeconds: 60 },
  mapsPerUser: { max: 60, windowSeconds: 60 },
  bookingPerUser: { max: 20, windowSeconds: 60 * 60 },
  otpIssuePerShipment: { max: 5, windowSeconds: 60 * 60 },
  ticketPerUser: { max: 10, windowSeconds: 60 * 60 },
  bulkUploadPerUser: { max: 10, windowSeconds: 60 * 60 },
  // Merchant bulk review: one call per 20 rows checked (a 1,000-row file is
  // 50 calls) plus one per corrected row.
  bulkProcessPerUser: { max: 600, windowSeconds: 60 * 60 },
  staffCreatePerUser: { max: 30, windowSeconds: 60 * 60 },
  merchantApplyPerUser: { max: 10, windowSeconds: 60 * 60 },
  // Issuing is idempotent (a second request returns the same invoice), so
  // this only stops a script hammering the issuing functions.
  invoicePerUser: { max: 60, windowSeconds: 60 * 60 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

// A translation key (i18n/message.ts): "Too many attempts. Please wait a few minutes…"
export const RATE_LIMIT_MESSAGE = 'errors.rateLimited';

// Counters live in Postgres (migration 0018) so every serverless instance
// shares them. Fails CLOSED: if the limiter can't be reached the request is
// refused — for the endpoints that use this (login, password reset, ...)
// that's the safer failure, and the database being unreachable would break
// those requests anyway.
export const checkRateLimit = async (name: RateLimitName, subject: string): Promise<boolean> => {
  const { max, windowSeconds } = RATE_LIMITS[name];
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_key: `${name}:${subject.toLowerCase()}`,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error('Rate limiter unavailable', name, error.message);
    return false;
  }
  return data === true;
};

export const checkIpRateLimit = async (name: RateLimitName): Promise<boolean> =>
  checkRateLimit(name, await getClientIp());
