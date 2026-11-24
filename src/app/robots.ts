import { siteUrl } from '@/lib/seo';

import type { MetadataRoute } from 'next';

// Authenticated pages are crawlable so search engines can see their noindex
// metadata. API routes and auth callbacks are not useful to a crawler.
const robots = (): MetadataRoute.Robots => ({
  rules: [
    {
      userAgent: '*',
      allow: '/',
      disallow: ['/api', '/auth'],
    },
  ],
  sitemap: `${siteUrl()}/sitemap.xml`,
  host: siteUrl(),
});

export default robots;
