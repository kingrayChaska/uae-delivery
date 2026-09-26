import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listDriverActiveShipments } from '@/services/shipments/list-driver-shipments';

const DriverDeliveriesPage = async () => {
  const profile = await requireRoleOrRedirect('driver');
  const active = await listDriverActiveShipments(profile.id);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">My Deliveries</h1>

      {active.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No active deliveries</p>
          <p className="text-sm text-muted-foreground">New assignments from dispatch will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath="/dashboard/driver/deliveries" />
          ))}
        </div>
      )}
    </main>
  );
};

export default DriverDeliveriesPage;
