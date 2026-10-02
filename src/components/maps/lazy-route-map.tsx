'use client';

import dynamic from 'next/dynamic';

// Maps need the browser (and the Google Maps script), so they're loaded on demand
// instead of being bundled into (and blocking hydration of) every page
// that shows a map.
const LazyRouteMap = dynamic(() => import('@/components/maps/route-map'), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-md bg-muted" />,
});

export default LazyRouteMap;
