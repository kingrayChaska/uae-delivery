import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';

import { connection } from 'next/server';

import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, siteUrl } from '@/lib/seo';

import type { Metadata, Viewport } from 'next';

// The favicon and app icons come from app/favicon.ico, app/icon.png and
// app/apple-icon.png (Next.js file conventions), generated from the
// ParcelLink mark.
// metadataBase makes canonical and Open Graph URLs absolute. Pages behind
// sign-in aren't indexed (robots.ts), so only public pages need their own
// canonical tags.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, type: 'website', locale: 'en_AE' },
  twitter: { card: 'summary_large_image' },
  formatDetection: { telephone: false },
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

  return (
    <html lang="en-AE" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
};

export default RootLayout;
