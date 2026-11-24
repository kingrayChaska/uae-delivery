import { afterEach, describe, expect, it, vi } from 'vitest';

import robots from './robots';
import sitemap from './sitemap';
import { SITE_URL } from '@/lib/seo';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('public SEO routes', () => {
  it('uses the official production domain regardless of deployment URL environment variables', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://parcellink-delivery.vercel.app');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'parcellink-delivery.vercel.app');
    vi.stubEnv('VERCEL_URL', 'preview.vercel.app');

    const entries = sitemap();

    expect(SITE_URL).toBe('https://www.parcellinkuae.com');
    expect(entries.length).toBeGreaterThan(0);
    for (const { url, alternates } of entries) {
      expect(url.startsWith(`${SITE_URL}/`) || url === SITE_URL).toBe(true);
      expect(url).not.toContain('vercel.app');
      for (const alternateUrl of Object.values(alternates?.languages ?? {})) {
        if (typeof alternateUrl !== 'string') {
          throw new Error('Sitemap language alternate must be a URL');
        }
        expect(alternateUrl.startsWith(`${SITE_URL}/`) || alternateUrl === SITE_URL).toBe(true);
        expect(alternateUrl).not.toContain('vercel.app');
      }
    }
  });

  it('includes public English and Arabic pages but excludes login and registration', () => {
    const urls = sitemap().map(({ url }) => url);

    expect(urls).toContain(`${SITE_URL}/tracking`);
    expect(urls).toContain(`${SITE_URL}/ar/tracking`);
    expect(urls).toContain(SITE_URL);
    expect(urls).toContain(`${SITE_URL}/ar`);
    expect(urls).not.toContain(`${SITE_URL}/login`);
    expect(urls).not.toContain(`${SITE_URL}/ar/login`);
    expect(urls).not.toContain(`${SITE_URL}/register`);
    expect(urls).not.toContain(`${SITE_URL}/ar/register`);
  });

  it('publishes the official sitemap URL in robots metadata', () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
