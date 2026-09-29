import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
// Arabic glyphs only (unicode-range), so English pages never download them.
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import './globals.css';

import { connection } from 'next/server';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';

import { OG_LOCALES, localeDirection } from '@/i18n/config';
import { PUBLIC_CLIENT_NAMESPACES } from '@/i18n/messages';
import { getRequestLocale } from '@/i18n/server';
import { SITE_NAME, siteUrl } from '@/lib/seo';

import type { Metadata, Viewport } from 'next';
import type { Messages } from '@/i18n/messages';

// The favicon and app icons come from app/favicon.ico, app/icon.png and
// app/apple-icon.png (Next.js file conventions), generated from the
// ParcelLink mark.
// metadataBase makes canonical and Open Graph URLs absolute. Pages behind
// sign-in aren't indexed (robots.ts), so only public pages need their own
// canonical tags.
export const generateMetadata = async (): Promise<Metadata> => {
  const [t, locale] = await Promise.all([getTranslations('meta'), getRequestLocale()]);
  return {
    metadataBase: new URL(siteUrl()),
    title: t('siteTitle'),
    description: t('siteDescription'),
    applicationName: SITE_NAME,
    openGraph: { siteName: SITE_NAME, type: 'website', locale: OG_LOCALES[locale] },
    twitter: { card: 'summary_large_image' },
    formatDetection: { telephone: false },
  };
};

// Tints the browser UI (mobile address bar) in the brand purple.
export const viewport: Viewport = {
  themeColor: '#7b3fa7',
};

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  // Every page must be rendered per request. The Content-Security-Policy
  // (proxy.ts) only runs scripts carrying that request's nonce, and Next.js
  // can only stamp the nonce onto its scripts while rendering. A page
  // prerendered at build time ships nonce-less scripts, the browser blocks
  // them all, and the page never hydrates — which is exactly how the login
  // page's Turnstile check and show-password button silently stopped working
  // in production builds.
  await connection();

  // English or Arabic, as the proxy resolved it (src/i18n). Arabic flips the
  // whole document to right-to-left.
  const [locale, messages] = await Promise.all([getRequestLocale(), getMessages()]);
  // Public pages only ship the messages their browser code uses;
  // app/dashboard/layout.tsx provides the rest to signed-in pages.
  const publicMessages = Object.fromEntries(
    PUBLIC_CLIENT_NAMESPACES.map((namespace) => [namespace, (messages as Messages)[namespace]]),
  );

  return (
    <html lang={locale} dir={localeDirection(locale)} className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <NextIntlClientProvider messages={publicMessages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
};

export default RootLayout;
