import { describe, expect, it } from 'vitest';

import { decideRoute, routeNeedsProfile } from '@/lib/auth/route-access';
import { DASHBOARD_HOME, ROLES } from '@/lib/types';

import type { Role } from '@/lib/types';

const as = (role: Role, active = true) => ({ role, active });

describe('decideRoute — signed out', () => {
  it.each([
    '/',
    '/tracking',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/auth/confirm',
    '/terms',
    // Crawlers and link previews have no session.
    '/robots.txt',
    '/sitemap.xml',
    '/opengraph-image',
    // Self-hosted assets the public landing page loads.
    '/vendor/dotlottie-player.wasm',
    // Background jobs authenticate with their own secret.
    '/api/internal/bulk-worker',
  ])(
    'allows public route %s',
    (pathname) => {
      expect(decideRoute({ pathname, signedIn: false, profile: null })).toEqual({ type: 'allow' });
    },
  );

  it.each(ROLES.map((r) => `/dashboard/${r}`))('sends %s to login, remembering where they were going', (pathname) => {
    expect(decideRoute({ pathname, signedIn: false, profile: null })).toEqual({
      type: 'redirect',
      to: `/login?redirectTo=${encodeURIComponent(pathname)}`,
    });
  });
});

describe('decideRoute — every role x every dashboard area (spec: "try accessing another role\'s routes")', () => {
  for (const role of ROLES) {
    for (const area of ROLES) {
      const pathname = `/dashboard/${area}/anything`;
      it(`${role} -> ${pathname}`, () => {
        const decision = decideRoute({ pathname, signedIn: true, profile: as(role) });
        expect(decision).toEqual(role === area ? { type: 'allow' } : { type: 'redirect', to: DASHBOARD_HOME[role] });
      });
    }
  }

  it('sends /dashboard and unknown areas to the role home', () => {
    expect(decideRoute({ pathname: '/dashboard', signedIn: true, profile: as('driver') })).toEqual({
      type: 'redirect',
      to: DASHBOARD_HOME.driver,
    });
    expect(decideRoute({ pathname: '/dashboard/admin', signedIn: true, profile: as('customer') })).toEqual({
      type: 'redirect',
      to: DASHBOARD_HOME.customer,
    });
  });
});

describe('decideRoute — signed-in users on auth pages', () => {
  it.each(ROLES)('active %s on /login goes to their dashboard', (role) => {
    expect(decideRoute({ pathname: '/login', signedIn: true, profile: as(role) })).toEqual({
      type: 'redirect',
      to: DASHBOARD_HOME[role],
    });
  });
});

describe('decideRoute — deactivated accounts (regression: redirect loop)', () => {
  it('keeps a deactivated user out of dashboards', () => {
    expect(decideRoute({ pathname: '/dashboard/operator', signedIn: true, profile: as('operator', false) })).toEqual({
      type: 'redirect',
      to: '/login?error=inactive',
    });
  });

  it('lets a deactivated user stay on /login instead of bouncing back to a dashboard', () => {
    expect(decideRoute({ pathname: '/login', signedIn: true, profile: as('operator', false) })).toEqual({ type: 'allow' });
  });

  it('treats a missing profile the same way', () => {
    expect(decideRoute({ pathname: '/dashboard/customer', signedIn: true, profile: null })).toEqual({
      type: 'redirect',
      to: '/login?error=inactive',
    });
    expect(decideRoute({ pathname: '/login', signedIn: true, profile: null })).toEqual({ type: 'allow' });
  });

  it('never produces a loop: following redirects from any start settles within 2 hops', () => {
    for (const profile of [as('customer'), as('driver', false), null]) {
      for (const start of ['/dashboard/manager', '/login', '/dashboard/customer', '/register']) {
        let pathname = start;
        let hops = 0;
        let decision = decideRoute({ pathname, signedIn: true, profile });
        while (decision.type === 'redirect') {
          pathname = decision.to.split('?')[0];
          hops += 1;
          expect(hops).toBeLessThanOrEqual(2);
          decision = decideRoute({ pathname, signedIn: true, profile });
        }
      }
    }
  });
});

describe('routeNeedsProfile — the proxy only looks up the profile where the layout cannot', () => {
  it.each(ROLES.map((r) => `/dashboard/${r}/shipments`))('skips the lookup for %s (its layout checks the role)', (pathname) => {
    expect(routeNeedsProfile(pathname)).toBe(false);
  });

  it.each(['/login', '/register', '/dashboard', '/dashboard/admin'])('looks up the profile for %s', (pathname) => {
    expect(routeNeedsProfile(pathname)).toBe(true);
  });

  it.each(['/', '/tracking', '/terms'])('never needs it on public page %s', (pathname) => {
    expect(routeNeedsProfile(pathname)).toBe(false);
  });

  it('allows a signed-in user through to a role dashboard when the profile was not looked up', () => {
    expect(decideRoute({ pathname: '/dashboard/manager', signedIn: true, profile: undefined })).toEqual({ type: 'allow' });
  });

  it('still sends a signed-out visitor to login without a profile lookup', () => {
    expect(decideRoute({ pathname: '/dashboard/manager', signedIn: false, profile: undefined })).toEqual({
      type: 'redirect',
      to: `/login?redirectTo=${encodeURIComponent('/dashboard/manager')}`,
    });
  });
});
