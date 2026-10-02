// Content-Security-Policy, built per request around a fresh nonce.
//
// Scripts: only ones carrying this request's nonce (Next.js applies it to
// its own scripts automatically) plus whatever those scripts load
// ('strict-dynamic') — that's how the on-demand Turnstile script is
// allowed without allow-listing every page. An injected <script> tag from
// an XSS bug has no nonce and won't run.
//
// Styles keep 'unsafe-inline': React, Google Maps, recharts and Turnstile
// all set inline styles, and style injection is far lower risk than script.
//
// Google Maps (the Maps JavaScript API) is allowed on every page, not just
// the dashboard: a page keeps the policy it was first loaded with, and
// signing in reaches the dashboard by client-side navigation. The hosts
// follow Google's published CSP guide. Its script is added by our own
// (nonced) code, so 'strict-dynamic' admits it and what it loads. Google's
// guide also lists 'unsafe-eval'; it's left out because loading the API,
// creating maps, Advanced Markers and route lines raised no violations
// without it — if a real key ever shows an eval violation in the console,
// that's the line to revisit.
const GOOGLE_MAPS = {
  images: ['https://*.googleapis.com', 'https://*.gstatic.com', 'https://*.google.com', 'https://*.googleusercontent.com'],
  connect: ['https://*.googleapis.com', 'https://*.google.com', 'https://*.gstatic.com'],
  fonts: ['https://fonts.gstatic.com'],
  styles: ['https://fonts.googleapis.com'],
  frames: ['https://*.google.com'],
};

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
      // Compiling WebAssembly (the hero's DotLottie renderer). Allows only
      // WASM compilation — JavaScript eval stays blocked.
      "'wasm-unsafe-eval'",
      // React's dev tooling needs eval; never allowed in production.
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'", ...GOOGLE_MAPS.styles],
    'img-src': ["'self'", 'data:', 'blob:', ...GOOGLE_MAPS.images, ...(supabase ? [supabase] : [])],
    'font-src': ["'self'", ...GOOGLE_MAPS.fonts],
    'connect-src': [
      "'self'",
      ...(supabase && supabaseWs ? [supabase, supabaseWs] : []),
      ...GOOGLE_MAPS.connect,
      'data:',
      'https://challenges.cloudflare.com',
      // The hero animation's .lottie file (its renderer is self-hosted).
      'https://lottie.host',
    ],
    'worker-src': ["'self'", 'blob:'],
    'child-src': ['blob:'],
    'frame-src': ['https://challenges.cloudflare.com', ...GOOGLE_MAPS.frames],
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
