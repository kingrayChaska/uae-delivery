import { notFound } from 'next/navigation';

import StatCard from '@/components/dashboard/stat-card';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { getCustomerDetail } from '@/services/customers/list-customers';

import type { StaffDetailViewProps } from '@/components/staff-views/types';

const CustomerDetailView = async ({ basePath, id }: StaffDetailViewProps) => {

  const detail = await getCustomerDetail(id);
  if (!detail) notFound();

  const { customer, shipments } = detail;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{customer.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          {customer.email} · {customer.phone}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Shipments" value={String(customer.shipmentCount)} />
        <StatCard label="Total Paid" value={`AED ${customer.totalSpent.toFixed(2)}`} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Shipment history</h2>
        {shipments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shipments yet.</p>
        ) : (
          shipments.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath={`${basePath}/shipments`} />
          ))
        )}
      </div>
    </main>
  );
};

export default CustomerDetailView;
