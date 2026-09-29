import { getTranslations } from 'next-intl/server';

import LiveMapClient from '@/components/operator/live-map-view';
import { listDriversForLiveMap } from '@/services/drivers/list-drivers-for-live-map';
import { getDriverLocationsSnapshot } from '@/services/drivers/get-driver-locations-snapshot';


const LiveMapView = async () => {
  const [drivers, snapshot, t] = await Promise.all([
    listDriversForLiveMap(),
    getDriverLocationsSnapshot(),
    getTranslations('operator.liveMap'),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <LiveMapClient drivers={drivers} initialLocations={snapshot.locations} />
    </main>
  );
};

export default LiveMapView;
