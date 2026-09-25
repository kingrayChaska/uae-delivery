import 'server-only';

import { headers } from 'next/headers';

// On Vercel (and most managed hosts) x-forwarded-for is set by the platform
// edge, and the first entry is the real client. If you self-host behind a
// proxy you don't control, make sure it overwrites this header — a
// client-supplied value would let an attacker rotate their apparent IP to
// dodge per-IP rate limits (per-account limits still apply regardless).
export const getClientIp = async (): Promise<string> => {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headerList.get('x-real-ip') ?? 'unknown';
};
