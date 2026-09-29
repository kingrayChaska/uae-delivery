import { PUBLIC_PAGES, siteUrl } from '@/lib/seo';

import type { MetadataRoute } from 'next';

const sitemap = (): MetadataRoute.Sitemap =>
  PUBLIC_PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${siteUrl()}${path === '/' ? '' : path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));

export default sitemap;
