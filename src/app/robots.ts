import { siteUrl } from '@/lib/seo';

import type { MetadataRoute } from 'next';

// Dashboards, auth callbacks and API routes are private or useless to a
// crawler; everything public is listed in the sitemap.
const robots = (): MetadataRoute.Robots => ({
  rules: [
    {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/api', '/auth', '/reset-password', '/forgot-password'],
    },
  ],
  sitemap: `${siteUrl()}/sitemap.xml`,
  host: siteUrl(),
});

export default robots;
