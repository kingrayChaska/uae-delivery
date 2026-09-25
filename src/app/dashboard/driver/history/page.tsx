import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listDriverShipments } from '@/services/shipments/list-driver-shipments';

const TERMINAL_STATUSES = ['delivered', 'delivery_failed', 'cancelled', 'returned'];

const DriverHistoryPage = async () => {
  const profile = await requireRoleOrRedirect('driver');
  const shipments = await listDriverShipments(profile.id);
  const history = shipments.filter((s) => TERMINAL_STATUSES.includes(s.status));

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Delivery History</h1>

      {history.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No completed deliveries yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath="/dashboard/driver/deliveries" />
          ))}
        </div>
      )}
    </main>
  );
};

export default DriverHistoryPage;
