// Content-Security-Policy, built per request around a fresh nonce.
//
// Scripts: only ones carrying this request's nonce (Next.js applies it to
// its own scripts automatically) plus whatever those scripts load
// ('strict-dynamic') — that's how the on-demand Turnstile script is
// allowed without allow-listing every page. An injected <script> tag from
// an XSS bug has no nonce and won't run.
//
// Styles keep 'unsafe-inline': React, mapbox-gl, recharts and Turnstile all
// set inline styles, and style injection is far lower risk than script.

type CspOptions = {
  nonce: string;
  isDev: boolean;
  supabaseUrl?: string;
  // Defaults to production-only. Callers turn it off for loopback hosts:
  // a production build run locally is served over plain http, and
  // browsers that honour it there (notably Safari) would rewrite every
  // script/stylesheet URL to https://localhost — which doesn't exist.
  upgradeInsecureRequests?: boolean;
};

const originOf = (url?: string) => {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

export const buildCsp = ({ nonce, isDev, supabaseUrl, upgradeInsecureRequests = !isDev }: CspOptions): string => {
  const supabase = originOf(supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, 'ws') : null;

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      'https://challenges.cloudflare.com',
      // React's dev tooling needs eval; never allowed in production.
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https://api.mapbox.com', ...(supabase ? [supabase] : [])],
    'font-src': ["'self'"],
    'connect-src': [
      "'self'",
      ...(supabase && supabaseWs ? [supabase, supabaseWs] : []),
      'https://api.mapbox.com',
      'https://*.tiles.mapbox.com',
      'https://events.mapbox.com',
      'https://challenges.cloudflare.com',
    ],
    'worker-src': ["'self'", 'blob:'],
    'child-src': ['blob:'],
    'frame-src': ['https://challenges.cloudflare.com'],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
  };

  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');

  return upgradeInsecureRequests ? `${policy}; upgrade-insecure-requests` : policy;
};

export const generateNonce = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
};

// This machine, by any of its usual names — where a production build is
// served over plain http during local testing.
export const isLoopbackHost = (hostname: string) =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname === '[::1]' ||
  hostname === '::1' ||
  /^127(\.\d{1,3}){3}$/.test(hostname);
