import createNextIntlPlugin from "next-intl/plugin";

import type { NextConfig } from "next";

// English/Arabic: src/i18n/request.ts picks the language for each request.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isProduction = process.env.NODE_ENV === "production";
const enableHsts = isProduction && process.env.ENABLE_HSTS === "true";

// Headers that don't vary per request. The Content-Security-Policy does
// (it carries a per-request nonce), so it's set in src/proxy.ts instead.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Camera: driver QR scanning. Geolocation: driver location pings.
  // Everything else is off.
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()",
  },
  // Only in production — HSTS on localhost would pin the browser to HTTPS
  // for local development.
  ...(enableHsts
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  headers: async () => [
    { source: "/:path*", headers: securityHeaders },
    {
      source: "/_next/static/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      source: "/fonts/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
  ],
};

export default withNextIntl(nextConfig);
