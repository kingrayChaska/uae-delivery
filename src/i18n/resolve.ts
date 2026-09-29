import {
  DEFAULT_LOCALE,
  isLocale,
  isLocalizedPath,
  localeFromAcceptLanguage,
  splitLocalePrefix,
} from '@/i18n/config';

import type { Locale } from '@/i18n/config';

// What the proxy does with a request's language. Pure, so every case is
// unit tested (resolve.test.ts).
export type LocaleDecision =
  // Render `pathname` (the page's real route) in `locale`. `rewrite` is set
  // when the URL carried a /ar prefix that the page route doesn't have.
  | { type: 'render'; locale: Locale; pathname: string; rewrite: boolean; remember: boolean }
  // Send the browser to `to`, remembering `locale`.
  | { type: 'redirect'; locale: Locale; to: string };

export const decideLocale = ({
  pathname,
  cookieLocale,
  acceptLanguage,
}: {
  pathname: string;
  cookieLocale: string | undefined;
  acceptLanguage: string | null;
}): LocaleDecision => {
  const prefixed = splitLocalePrefix(pathname);

  if (prefixed.locale) {
    // /ar/tracking → the Arabic version of /tracking. Visiting it is an
    // explicit choice, so it's remembered.
    if (prefixed.locale !== DEFAULT_LOCALE && isLocalizedPath(prefixed.pathname)) {
      return { type: 'render', locale: prefixed.locale, pathname: prefixed.pathname, rewrite: true, remember: true };
    }
    // English has no prefix (/en/... → /...), and signed-in pages have one
    // URL for both languages (/ar/dashboard/... → /dashboard/...).
    return { type: 'redirect', locale: prefixed.locale, to: prefixed.pathname };
  }

  // Unprefixed: the saved choice, else the browser's language on a first
  // visit, else English.
  const locale = isLocale(cookieLocale) ? cookieLocale : (localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE);
  return { type: 'render', locale, pathname, rewrite: false, remember: false };
};
