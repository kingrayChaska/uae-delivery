import Link from 'next/link';

import Button from '@/components/ui/button';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import Pagination from '@/components/dashboard/pagination';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { listCustomerShipments } from '@/services/shipments/list-shipments';

import type { PageSearchParams } from '@/lib/pagination';

const DeliveriesPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  const profile = await requireRoleOrRedirect('customer');
  const shipments = await listCustomerShipments(profile.id, parsePage((await searchParams).page));

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Deliveries</h1>
        <Button asChild>
          <Link href="/dashboard/customer/book">Book Delivery</Link>
        </Button>
      </div>

      {shipments.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No deliveries yet</p>
          <p className="text-sm text-muted-foreground">Your booked shipments will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shipments.items.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} />
          ))}
        </div>
      )}

      <Pagination page={shipments.page} totalPages={shipments.totalPages} href="/dashboard/customer/deliveries" />
    </main>
  );
};

export default DeliveriesPage;
