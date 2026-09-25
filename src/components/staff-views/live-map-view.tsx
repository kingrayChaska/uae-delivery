import LiveMapClient from '@/components/operator/live-map-view';
import { listDriversForLiveMap } from '@/services/drivers/list-drivers-for-live-map';
import { getDriverLocationsSnapshot } from '@/services/drivers/get-driver-locations-snapshot';


const LiveMapView = async () => {
  const [drivers, snapshot] = await Promise.all([listDriversForLiveMap(), getDriverLocationsSnapshot()]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Live Map</h1>
      <LiveMapClient drivers={drivers} initialLocations={snapshot.locations} />
    </main>
  );
};

export default LiveMapView;
