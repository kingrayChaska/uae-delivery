'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

// The map component (and the Google Maps script) load only when a customer
// actually chooses to drop a pin.
const LazyMapLocationSelector = dynamic(() => import('@/components/maps/map-location-selector'), {
  ssr: false,
  loading: () => <MapLoading />,
});

const MapLoading = () => {
  const t = useTranslations('maps.map');
  return (
    <div className="flex size-full items-center justify-center bg-muted text-sm text-muted-foreground" role="status">
      {t('loading')}
    </div>
  );
};

export default LazyMapLocationSelector;
