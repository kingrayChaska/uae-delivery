// Languages ParcelLink is available in. Imported by the proxy (edge), the
// server and the browser, so it must stay free of server-only imports.

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

// The one place the chosen language is remembered (a year, every page).
export const LOCALE_COOKIE = 'NEXT_LOCALE';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Set by the proxy on every request: the locale it resolved for this page.
export const LOCALE_HEADER = 'x-parcellink-locale';

export const isLocale = (value: unknown): value is Locale => (LOCALES as readonly unknown[]).includes(value);

// Browser only: the saved choice, as the proxy will read it on the next request.
export const readSavedLocale = (): Locale | null => {
  const saved = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return isLocale(saved) ? saved : null;
};

// Browser only: remembers the chosen language (the proxy sets the same cookie
// for /ar visits).
export const saveLocale = (locale: Locale) => {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
};

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', ar: 'العربية' };

export const localeDirection = (locale: Locale) => (locale === 'ar' ? 'rtl' : 'ltr');

// The locale Intl formats with (numbers, dates, plurals — also next-intl's
// locale). Arabic uses Western digits ("nu-latn"), as UAE apps and receipts
// do, so amounts, distances and dates stay unambiguous next to tracking IDs
// and phone numbers. It's pinned explicitly because browsers' ICU data
// differ on Arabic's default digits, and the server and browser must agree.
export const INTL_LOCALES: Record<Locale, string> = { en: 'en-AE', ar: 'ar-AE-u-nu-latn' };

// Back from an Intl locale (next-intl's useLocale()) to 'en' | 'ar'.
export const toLocale = (intlLocale: string): Locale => {
  const base = intlLocale.toLowerCase().split('-')[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
};

// Open Graph locale codes.
export const OG_LOCALES: Record<Locale, string> = { en: 'en_AE', ar: 'ar_AE' };

// ── URLs ─────────────────────────────────────────────────────────────────────
// English lives at the existing URLs. Arabic public pages also have their
// own URLs under /ar (e.g. /ar/tracking) so search engines can index them;
// the proxy serves them from the same pages. Signed-in pages keep one URL
// and follow the cookie.

// Public, indexable pages that have an /ar version.
export const LOCALIZED_PATHS = ['/', '/tracking', '/login', '/register', '/forgot-password', '/privacy', '/terms'];

export const isLocalizedPath = (pathname: string) => LOCALIZED_PATHS.includes(pathname);

// Splits "/ar/tracking" into { locale: 'ar', pathname: '/tracking' }.
export const splitLocalePrefix = (pathname: string): { locale: Locale | null; pathname: string } => {
  for (const locale of LOCALES) {
    if (pathname === `/${locale}`) return { locale, pathname: '/' };
    if (pathname.startsWith(`/${locale}/`)) return { locale, pathname: pathname.slice(locale.length + 1) };
  }
  return { locale: null, pathname };
};

// The address of a page in a language. Only Arabic public pages get a prefix.
export const localizedPath = (pathname: string, locale: Locale) => {
  if (locale === DEFAULT_LOCALE || !isLocalizedPath(pathname)) return pathname;
  return pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;
};

// localizedPath for a link that may carry a query or #anchor ("/#pricing").
export const localizeHref = (href: string, locale: Locale) => {
  if (!href.startsWith('/')) return href;
  const cut = href.search(/[?#]/);
  const path = cut === -1 ? href : href.slice(0, cut);
  const rest = cut === -1 ? '' : href.slice(cut);
  return `${localizedPath(path || '/', locale)}${rest}`;
};

// First choice from an Accept-Language header that we support, if any.
export const localeFromAcceptLanguage = (header: string | null): Locale | null => {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { language: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((entry) => entry.language && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.map((entry) => entry.language).find(isLocale) ?? null;
};
