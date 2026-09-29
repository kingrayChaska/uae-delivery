'use client';

import dynamic from 'next/dynamic';

// mapbox-gl is large and browser-only, so it loads only when a customer
// actually chooses to drop a pin.
const LazyMapLocationSelector = dynamic(() => import('@/components/maps/map-location-selector'), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center bg-muted text-sm text-muted-foreground" role="status">
      Loading map…
    </div>
  ),
});

export default LazyMapLocationSelector;
