import { describe, expect, it } from 'vitest';

import { getCanonicalRedirectUrl, SITE_NAME, SITE_URL } from './seo';

describe('canonical SEO configuration', () => {
  it('uses the official site name and canonical origin', () => {
    expect(SITE_NAME).toBe('ParcelLink UAE');
    expect(SITE_URL).toBe('https://www.parcellinkuae.com');
  });

  it.each([
    'https://parcellink-delivery.vercel.app/tracking?source=legacy',
    'https://parcellinkuae.com/ar/tracking?source=apex',
  ])('redirects public pages from %s to the official host', (input) => {
    expect(getCanonicalRedirectUrl(new URL(input), 'GET')?.toString()).toBe(
      input.replace(/^https:\/\/[^/]+/, SITE_URL),
    );
  });

  it('uses the forwarded host when the request URL contains an internal hostname', () => {
    const url = new URL('http://localhost:3100/tracking?campaign=seo');

    expect(
      getCanonicalRedirectUrl(url, 'GET', 'parcellink-delivery.vercel.app'),
    ).toBeInstanceOf(URL);
    expect(
      getCanonicalRedirectUrl(url, 'GET', 'parcellink-delivery.vercel.app')?.toString(),
    ).toBe('https://www.parcellinkuae.com/tracking?campaign=seo');
  });

  it('does not redirect API requests or authentication callbacks', () => {
    expect(
      getCanonicalRedirectUrl(
        new URL('https://parcellink-delivery.vercel.app/auth/callback?code=oauth-code'),
        'GET',
      ),
    ).toBeNull();
    expect(
      getCanonicalRedirectUrl(
        new URL('https://parcellink-delivery.vercel.app/api/mobile/v1/auth'),
        'GET',
      ),
    ).toBeNull();
  });

  it('does not redirect write requests or the official host', () => {
    expect(
      getCanonicalRedirectUrl(new URL('https://parcellink-delivery.vercel.app/tracking'), 'POST'),
    ).toBeNull();
    expect(
      getCanonicalRedirectUrl(new URL(`${SITE_URL}/tracking`), 'GET'),
    ).toBeNull();
  });
});
