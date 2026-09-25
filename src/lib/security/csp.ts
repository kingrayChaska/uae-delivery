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
};

const originOf = (url?: string) => {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

export const buildCsp = ({ nonce, isDev, supabaseUrl }: CspOptions): string => {
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

  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
};

export const generateNonce = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
};
