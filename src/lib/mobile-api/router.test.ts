import { describe, expect, it } from 'vitest';

import { fromAction, matchRoute } from '@/lib/mobile-api/router';

import type { MobileRoute } from '@/lib/mobile-api/router';

const handle = async () => ({ status: 200 as const, data: null });
const routes: MobileRoute[] = [
  { method: 'GET', path: 'me', access: ['driver'], handle },
  { method: 'POST', path: 'driver/shipments/:id/accept', access: ['driver'], handle },
  { method: 'GET', path: 'driver/shipments/:id', access: ['driver'], handle },
];

describe('matchRoute', () => {
  it('matches a static path', () => {
    const match = matchRoute(routes, 'GET', ['me']);
    expect(match.route?.path).toBe('me');
  });

  it('captures parameters', () => {
    const match = matchRoute(routes, 'POST', ['driver', 'shipments', 'abc-123', 'accept']);
    expect(match.route?.path).toBe('driver/shipments/:id/accept');
    expect('params' in match && match.params).toEqual({ id: 'abc-123' });
  });

  it('tells a wrong method apart from an unknown path', () => {
    expect(matchRoute(routes, 'DELETE', ['me'])).toEqual({ route: null, methodMismatch: true });
    expect(matchRoute(routes, 'GET', ['nope'])).toEqual({ route: null, methodMismatch: false });
  });

  it('never matches a different number of segments', () => {
    expect(matchRoute(routes, 'GET', ['driver', 'shipments']).route).toBeNull();
    expect(matchRoute(routes, 'GET', ['me', 'extra']).route).toBeNull();
  });

  it.each([['..'], ['a b'], ['x%2F'], ['a'.repeat(101)], ['']])('rejects the unsafe segment %j', (segment) => {
    expect(matchRoute(routes, 'GET', ['driver', 'shipments', segment]).route).toBeNull();
  });
});

describe('fromAction', () => {
  it('passes successes through', () => {
    expect(fromAction({ success: true })).toEqual({ status: 200, data: { success: true } });
  });

  it('turns refusals into 422 with the message key', () => {
    expect(fromAction({ success: false, error: 'driver.errors.notFound' })).toEqual({
      status: 422,
      error: 'driver.errors.notFound',
    });
  });

  it('turns rate limits into 429', () => {
    expect(fromAction({ success: false, error: 'errors.rateLimited' })).toEqual({ status: 429, error: 'errors.rateLimited' });
  });
});
