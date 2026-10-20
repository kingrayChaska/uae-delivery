import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const getSession = vi.fn();
vi.mock('@/lib/auth/session', () => ({ getSession: () => getSession() }));

import { AuthError, ForbiddenError } from '@/lib/auth/guards';
import { handleMobileRequest } from '@/lib/mobile-api/handler';
import { getMobileAccessToken } from '@/lib/supabase/mobile-auth-context';

import type { MobileRoute } from '@/lib/mobile-api/router';
import type { Profile } from '@/lib/types';

vi.mock('@/lib/auth/guards', async () => {
  class AuthError extends Error {}
  class ForbiddenError extends Error {}
  return { AuthError, ForbiddenError };
});

const TOKEN = 'header.payload.signature-long-enough';
const profile = (role: Profile['role'], active = true): Profile => ({
  id: '11111111-1111-4111-8111-111111111111',
  role,
  fullName: 'Test',
  email: 't@example.com',
  phone: '',
  avatarUrl: null,
  active,
  accountType: 'individual',
  accountTypeSelectedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
});

const seenTokens: (string | undefined)[] = [];
const routes: MobileRoute[] = [
  {
    method: 'GET',
    path: 'driver-only',
    access: ['driver'],
    handle: async ({ profile }) => {
      seenTokens.push(getMobileAccessToken());
      return { status: 200, data: { id: profile?.id } };
    },
  },
  { method: 'POST', path: 'echo', access: 'public', handle: async ({ body }) => ({ status: 200, data: body }) },
  {
    method: 'GET',
    path: 'throws/:kind',
    access: ['driver'],
    handle: async ({ params }) => {
      if (params.kind === 'auth') throw new AuthError();
      if (params.kind === 'forbidden') throw new ForbiddenError();
      throw new Error('boom');
    },
  },
];

const request = (path: string, init: RequestInit & { token?: string | null } = {}) => {
  const { token = TOKEN, ...rest } = init;
  return new Request(`https://example.test/api/mobile/v1/${path}`, {
    ...rest,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(rest.headers ?? {}) },
  });
};

const call = async (path: string, init?: RequestInit & { token?: string | null }) => {
  const response = await handleMobileRequest(request(path, init), path.split('?')[0].split('/'), routes);
  return { status: response.status, body: await response.json(), headers: response.headers };
};

beforeEach(() => {
  getSession.mockReset();
  seenTokens.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('handleMobileRequest', () => {
  it('runs the route as the bearer token user, then leaves the token scope', async () => {
    getSession.mockResolvedValue({ signedIn: true, profile: profile('driver') });
    const result = await call('driver-only');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, data: { id: profile('driver').id } });
    expect(seenTokens).toEqual([TOKEN]);
    expect(getMobileAccessToken()).toBeUndefined();
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses a missing or malformed token without touching the session', async () => {
    expect((await call('driver-only', { token: null })).status).toBe(401);
    expect((await call('driver-only', { token: 'short' })).status).toBe(401);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('refuses a token the session check rejects (bad signature, expired)', async () => {
    getSession.mockResolvedValue({ signedIn: false, profile: null });
    const result = await call('driver-only');
    expect(result).toMatchObject({ status: 401, body: { ok: false, error: 'mobile.errors.signedOut' } });
  });

  it('refuses a deactivated account', async () => {
    getSession.mockResolvedValue({ signedIn: true, profile: profile('driver', false) });
    expect(await call('driver-only')).toMatchObject({ status: 403, body: { error: 'auth.errors.inactive' } });
  });

  it.each(['customer', 'operator', 'manager'] as const)('refuses the %s role on a driver route', async (role) => {
    getSession.mockResolvedValue({ signedIn: true, profile: profile(role) });
    expect(await call('driver-only')).toMatchObject({ status: 403, body: { error: 'errors.forbidden' } });
    expect(seenTokens).toEqual([]);
  });

  it('maps errors thrown by reused actions, hiding unexpected ones', async () => {
    getSession.mockResolvedValue({ signedIn: true, profile: profile('driver') });
    expect((await call('throws/auth')).status).toBe(401);
    expect((await call('throws/forbidden')).status).toBe(403);
    expect(await call('throws/other')).toMatchObject({ status: 500, body: { ok: false, error: 'errors.generic' } });
  });

  it('serves public routes without a session and parses JSON bodies', async () => {
    const result = await call('echo', { method: 'POST', token: null, body: JSON.stringify({ a: 1 }) });
    expect(result).toMatchObject({ status: 200, body: { ok: true, data: { a: 1 } } });
    expect(getSession).not.toHaveBeenCalled();
  });

  it('rejects invalid and oversized bodies', async () => {
    expect((await call('echo', { method: 'POST', token: null, body: '{nope' })).status).toBe(400);
    expect((await call('echo', { method: 'POST', token: null, body: JSON.stringify({ a: 'x'.repeat(70_000) }) })).status).toBe(400);
  });

  it('answers 404 for unknown paths and 405 for the wrong method', async () => {
    expect((await call('unknown')).status).toBe(404);
    expect((await call('echo', { method: 'GET' })).status).toBe(405);
  });
});
