import { NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp, generateNonce, isLoopbackHost } from "@/lib/security/csp";
import { decideLocale } from "@/i18n/resolve";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_HEADER } from "@/i18n/config";

import type { Locale } from "@/i18n/config";

import type { NextRequest } from "next/server";

const isProduction = process.env.NODE_ENV === "production";
const enableHttpsRedirect =
  isProduction && process.env.ENABLE_HTTPS_REDIRECT === "true";

export const proxy = async (request: NextRequest) => {
  // Force HTTPS. Managed hosts (Vercel etc.) already redirect at the edge;
  // this covers self-hosting behind a TLS-terminating proxy. HSTS (set in
  // next.config.ts) then keeps browsers on HTTPS for future visits.
  if (
    enableHttpsRedirect &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  // Language: an /ar URL prefix, else the saved choice, else the browser's
  // language (i18n/resolve.ts). The pages read the result from LOCALE_HEADER.
  const localeDecision = decideLocale({
    pathname: request.nextUrl.pathname,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  if (localeDecision.type === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = localeDecision.to;
    return rememberLocale(NextResponse.redirect(url), localeDecision.locale);
  }
  request.headers.set(LOCALE_HEADER, localeDecision.locale);

  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev: !isProduction,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    upgradeInsecureRequests: isProduction && !isLoopbackHost(request.nextUrl.hostname),
  });

  // Next.js reads the nonce from the *request* CSP header and applies it to
  // the scripts it renders. updateSession forwards these request headers.
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);

  const response = await updateSession(request, {
    pathname: localeDecision.pathname,
    rewrite: localeDecision.rewrite,
  });
  response.headers.set("Content-Security-Policy", csp);
  // The same URL can render in either language (the cookie decides).
  response.headers.append("Vary", "Cookie, Accept-Language");
  return localeDecision.remember ? rememberLocale(response, localeDecision.locale) : response;
};

const rememberLocale = (response: NextResponse, locale: Locale) => {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: isProduction,
  });
  return response;
};

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm)$).*)",
      // Prefetches don't render HTML, so they don't need a nonce.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    // Language-prefixed URLs always need the proxy, prefetches included:
    // /ar/tracking only exists as a rewrite of /tracking.
    "/(ar|en)",
    "/(ar|en)/:path*",
  ],
};
