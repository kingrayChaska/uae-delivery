import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, INTL_LOCALES, LOCALE_COOKIE, LOCALE_HEADER, isLocale, toLocale } from '@/i18n/config';
import { loadMessages } from '@/i18n/messages';

import type { Locale } from '@/i18n/config';

// The locale the proxy resolved for this request (URL prefix, cookie or
// browser language). Requests the proxy skips — router prefetches — fall
// back to the cookie, which is where the proxy's answer comes from anyway.
export const getRequestLocale = async (): Promise<Locale> => {
  const fromProxy = (await headers()).get(LOCALE_HEADER);
  if (isLocale(fromProxy)) return fromProxy;
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
};

export default getRequestConfig(async ({ locale: explicit }) => {
  const locale = explicit ? toLocale(explicit) : await getRequestLocale();
  return {
    locale: INTL_LOCALES[locale],
    messages: await loadMessages(locale),
    // Shipments, pickups and payments all happen in UAE time.
    timeZone: 'Asia/Dubai',
  };
});
