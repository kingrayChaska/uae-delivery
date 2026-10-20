import 'server-only';

import { NextResponse } from 'next/server';

import { AuthError, ForbiddenError } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { matchRoute } from '@/lib/mobile-api/router';
import { runWithMobileAccessToken } from '@/lib/supabase/mobile-auth-context';

import type { MobileResult, MobileRoute } from '@/lib/mobile-api/router';

// Bodies are small JSON objects (ids, a reason, a storage path). Photos go
// straight to Supabase Storage from the app, never through here.
const MAX_BODY_BYTES = 64 * 1024;

const BEARER = /^Bearer ([A-Za-z0-9._-]{20,4096})$/;

const respond = (result: MobileResult) =>
  NextResponse.json(
    'data' in result ? { ok: true, data: result.data } : { ok: false, error: result.error },
    // Per-user data: never cached by a CDN or the device's HTTP cache.
    { status: result.status, headers: { 'Cache-Control': 'no-store' } },
  );

const readBody = async (request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> => {
  if (request.method === 'GET') return { ok: true, body: null };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false };
  if (!text) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
};

export const handleMobileRequest = async (
  request: Request,
  segments: readonly string[],
  routes: readonly MobileRoute[],
): Promise<Response> => {
  const match = matchRoute(routes, request.method, segments);
  if (!match.route) {
    return match.methodMismatch
      ? NextResponse.json({ ok: false, error: 'errors.generic' }, { status: 405, headers: { 'Cache-Control': 'no-store' } })
      : respond({ status: 404, error: 'errors.notFound' });
  }
  const { route, params } = match;

  const parsedBody = await readBody(request);
  if (!parsedBody.ok) return respond({ status: 400, error: 'errors.invalidInput' });

  const query = new URL(request.url).searchParams;

  try {
    if (route.access === 'public') {
      return respond(await route.handle({ params, query, body: parsedBody.body, profile: null }));
    }

    const token = request.headers.get('authorization')?.match(BEARER)?.[1];
    if (!token) return respond({ status: 401, error: 'mobile.errors.signedOut' });

    const access = route.access;
    return await runWithMobileAccessToken(token, async () => {
      // The same check every website request gets: the token's signature
      // and expiry (getClaims), then the profile row.
      const session = await getSession();
      if (!session.signedIn) return respond({ status: 401, error: 'mobile.errors.signedOut' });
      if (!session.profile || !session.profile.active) return respond({ status: 403, error: 'auth.errors.inactive' });
      if (!access.includes(session.profile.role)) return respond({ status: 403, error: 'errors.forbidden' });

      return respond(await route.handle({ params, query, body: parsedBody.body, profile: session.profile }));
    });
  } catch (error) {
    // requireRole() inside the reused actions throws these.
    if (error instanceof AuthError) return respond({ status: 401, error: 'mobile.errors.signedOut' });
    if (error instanceof ForbiddenError) return respond({ status: 403, error: 'errors.forbidden' });
    console.error('Mobile API error', request.method, route.path, error);
    return NextResponse.json({ ok: false, error: 'errors.generic' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
};
