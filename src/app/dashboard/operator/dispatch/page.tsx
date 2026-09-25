import DispatchBoard from '@/components/operator/dispatch-board';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listUnassignedShipments } from '@/services/shipments/list-all-shipments';
import { getDriverLocationsSnapshot } from '@/services/drivers/get-driver-locations-snapshot';

const DispatchPage = async () => {
  await requireRoleOrRedirect('operator');
  const [unassigned, snapshot] = await Promise.all([listUnassignedShipments(), getDriverLocationsSnapshot()]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Dispatch</h1>
      <DispatchBoard
        unassignedShipments={unassigned}
        initialDriverLocations={snapshot.locations}
        driverLabels={snapshot.labels}
      />
    </main>
  );
};

export default DispatchPage;
