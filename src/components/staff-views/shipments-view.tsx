import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import Pagination from '@/components/dashboard/pagination';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { listAllShipments } from '@/services/shipments/list-all-shipments';

import type { StaffListViewProps } from '@/components/staff-views/types';

const ShipmentsView = async ({ basePath, page }: StaffListViewProps) => {
  const [shipments, t] = await Promise.all([listAllShipments(page), getTranslations('operator.shipments')]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Button asChild>
          <Link href={`${basePath}/shipments/new`}>{t('new')}</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('total', { count: shipments.total })}</p>

      {shipments.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shipments.items.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath={`${basePath}/shipments`} />
          ))}
        </div>
      )}

      <Pagination page={shipments.page} totalPages={shipments.totalPages} href={`${basePath}/shipments`} />
    </main>
  );
};

export default ShipmentsView;
