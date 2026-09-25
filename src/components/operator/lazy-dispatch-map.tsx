'use client';

import dynamic from 'next/dynamic';

// mapbox-gl is ~1.7MB and needs the browser, so it's loaded on demand
// instead of being bundled into the dispatch and live-map pages.
const LazyDispatchMap = dynamic(() => import('@/components/operator/dispatch-map'), {
  ssr: false,
  loading: () => <div className="h-96 w-full animate-pulse rounded-md bg-muted" />,
});

export default LazyDispatchMap;
