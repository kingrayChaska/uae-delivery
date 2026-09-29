import { NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp, generateNonce, isLoopbackHost } from "@/lib/security/csp";

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

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
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
  ],
};
