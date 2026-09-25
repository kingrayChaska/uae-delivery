import Link from 'next/link';

import Button from '@/components/ui/button';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listCustomerShipments } from '@/services/shipments/list-shipments';

const DeliveriesPage = async () => {
  const profile = await requireRoleOrRedirect('customer');
  const shipments = await listCustomerShipments(profile.id);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Deliveries</h1>
        <Button asChild>
          <Link href="/dashboard/customer/book">Book Delivery</Link>
        </Button>
      </div>

      {shipments.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No deliveries yet</p>
          <p className="text-sm text-muted-foreground">Your booked shipments will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shipments.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} />
          ))}
        </div>
      )}
    </main>
  );
};

export default DeliveriesPage;
