import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListFilter } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import BatchDetail from '@/components/bulk/batch-detail';
import { getBatchDetail } from '@/services/bulk/list-batches';

import type { StaffDetailListViewProps } from '@/components/staff-views/types';

const BulkBatchDetailView = async ({ basePath, id, page }: StaffDetailListViewProps) => {
  const [batch, t] = await Promise.all([getBatchDetail(id, page), getTranslations('operator.bulk')]);
  if (!batch) notFound();

  return (
    <BatchDetail
      batch={batch}
      backHref={`${basePath}/bulk`}
      shipmentBasePath={`${basePath}/shipments`}
      pageHref={`${basePath}/bulk/${batch.id}`}
      showSender
      actions={
        // The batch's shipments in the main queue, filtered to this batch.
        <Button asChild variant="outline" size="sm">
          <Link href={`${basePath}/shipments?batch=${batch.id}`}>
            <ListFilter aria-hidden />
            {t('openInShipments')}
          </Link>
        </Button>
      }
    />
  );
};

export default BulkBatchDetailView;
