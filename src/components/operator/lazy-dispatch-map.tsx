'use client';

import dynamic from 'next/dynamic';

// Maps need the browser (and the Google Maps script), so they're loaded on demand
// instead of being bundled into the dispatch and live-map pages.
const LazyDispatchMap = dynamic(() => import('@/components/operator/dispatch-map'), {
  ssr: false,
  loading: () => <div className="h-96 w-full animate-pulse rounded-md bg-muted" />,
});

export default LazyDispatchMap;
