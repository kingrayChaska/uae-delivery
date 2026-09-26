import ShipmentListItem from '@/components/shipment/shipment-list-item';
import Pagination from '@/components/dashboard/pagination';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { listDriverHistory } from '@/services/shipments/list-driver-shipments';

import type { PageSearchParams } from '@/lib/pagination';

const DriverHistoryPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  const profile = await requireRoleOrRedirect('driver');
  const history = await listDriverHistory(profile.id, parsePage((await searchParams).page));

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Delivery History</h1>

      {history.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No completed deliveries yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {history.items.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath="/dashboard/driver/deliveries" />
          ))}
        </div>
      )}

      <Pagination page={history.page} totalPages={history.totalPages} href="/dashboard/driver/history" />
    </main>
  );
};

export default DriverHistoryPage;
