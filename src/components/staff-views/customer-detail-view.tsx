import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import StatCard from '@/components/dashboard/stat-card';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import Pagination from '@/components/dashboard/pagination';
import { getCustomerDetail } from '@/services/customers/list-customers';
import { getFormat } from '@/i18n/server';

import type { StaffDetailListViewProps } from '@/components/staff-views/types';

const CustomerDetailView = async ({ basePath, id, page }: StaffDetailListViewProps) => {
  const detail = await getCustomerDetail(id, page);
  if (!detail) notFound();

  const { customer, shipments } = detail;
  const [t, format] = await Promise.all([getTranslations('operator.customers'), getFormat()]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{customer.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          <span dir="ltr">{customer.email}</span> · <span dir="ltr">{customer.phone}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label={t('stats.shipments')} value={format.number(customer.shipmentCount)} />
        <StatCard label={t('stats.paid')} value={format.money(customer.totalSpent)} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">{t('history')}</h2>
        {shipments.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noShipments')}</p>
        ) : (
          shipments.items.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath={`${basePath}/shipments`} />
          ))
        )}
        <Pagination
          page={shipments.page}
          totalPages={shipments.totalPages}
          href={`${basePath}/customers/${customer.id}`}
        />
      </div>
    </main>
  );
};

export default CustomerDetailView;
