// The app's public origin, for building redirects in route handlers.
//
// Never derive it from the incoming request: behind a reverse proxy the
// request URL carries the INTERNAL address (e.g. https://app:3000), so
// confirmation / invite / reset links bounced users to an unreachable port
// (found by the end-to-end suite behind a TLS proxy). Trusting the Host
// header would also let a forged header redirect users to another site.
export const publicUrl = (path: string, fallbackOrigin: string) => {
  const base = process.env.NEXT_PUBLIC_APP_URL || fallbackOrigin;
  return new URL(path, base);
};
