import { LOCALES, localizedPath } from '@/i18n/config';
import { PUBLIC_PAGES, siteUrl } from '@/lib/seo';

import type { MetadataRoute } from 'next';

// Every public page in both languages. Each entry lists its translations
// (hreflang), so search engines treat /tracking and /ar/tracking as the
// English and Arabic versions of one page, not duplicates.
const sitemap = (): MetadataRoute.Sitemap => {
  const url = (path: string) => `${siteUrl()}${path === '/' ? '' : path}`;
  return PUBLIC_PAGES.flatMap(({ path, priority, changeFrequency }) => {
    const languages = Object.fromEntries(LOCALES.map((locale) => [locale, url(localizedPath(path, locale))]));
    return LOCALES.map((locale) => ({
      url: url(localizedPath(path, locale)),
      lastModified: new Date(),
      changeFrequency,
      priority,
      alternates: { languages },
    }));
  });
};

export default sitemap;
