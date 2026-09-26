// The app's public origin, for building redirects in route handlers.
//
// Never derive it from the incoming request: behind a reverse proxy the
// request URL carries the INTERNAL address (e.g. https://app:3000), so
// confirmation / invite / reset links bounced users to an unreachable port
// (found by the end-to-end suite behind a TLS proxy). Trusting the Host
// header would also let a forged header redirect users to another site.
export const getPublicOrigin = (fallbackOrigin = "http://localhost:3000") => {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const vercelDeployment = process.env.VERCEL_URL;
  const origin =
    configured || vercelProduction || vercelDeployment || fallbackOrigin;

  return origin.startsWith("http://") || origin.startsWith("https://")
    ? origin
    : `https://${origin}`;
};

export const publicUrl = (
  path: string,
  fallbackOrigin = "http://localhost:3000",
) => {
  return new URL(path, getPublicOrigin(fallbackOrigin));
};
