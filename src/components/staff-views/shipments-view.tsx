import Link from 'next/link';
import { X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import Pagination from '@/components/dashboard/pagination';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { listAllShipments } from '@/services/shipments/list-all-shipments';
import { getBatchLabel } from '@/services/bulk/list-batches';

import type { StaffListViewProps } from '@/components/staff-views/types';

// ?batch=<id> narrows the list to one bulk batch's shipments.
const ShipmentsView = async ({ basePath, page, batchId = null }: StaffListViewProps & { batchId?: string | null }) => {
  const [shipments, batch, t] = await Promise.all([
    listAllShipments(page, { batchId }),
    getBatchLabel(batchId),
    getTranslations('operator.shipments'),
  ]);
  const listHref = batch ? `${basePath}/shipments?batch=${batch.id}` : `${basePath}/shipments`;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Button asChild>
          <Link href={`${basePath}/shipments/new`}>{t('new')}</Link>
        </Button>
      </div>
      {batch ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('filteredBy')}</span>
          <Link href={`${basePath}/bulk/${batch.id}`} className="rounded-md bg-secondary px-2 py-1 hover:underline">
            <span dir="ltr" className="font-brand-mono">
              {batch.reference}
            </span>
            {batch.sender ? <span className="text-muted-foreground"> · {batch.sender}</span> : null}
          </Link>
          <Link href={`${basePath}/shipments`} className="inline-flex items-center gap-1 text-muted-foreground hover:underline">
            <X className="size-3.5" aria-hidden />
            {t('clearFilter')}
          </Link>
        </div>
      ) : null}
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

      <Pagination page={shipments.page} totalPages={shipments.totalPages} href={listHref} />
    </main>
  );
};

export default ShipmentsView;
