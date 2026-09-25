import { notFound } from 'next/navigation';

import BatchDetail from '@/components/bulk/batch-detail';
import { getBatchDetail } from '@/services/bulk/list-batches';

import type { StaffDetailViewProps } from '@/components/staff-views/types';

const BulkBatchDetailView = async ({ basePath, id }: StaffDetailViewProps) => {
  const batch = await getBatchDetail(id);
  if (!batch) notFound();

  return (
    <BatchDetail batch={batch} backHref={`${basePath}/bulk`} shipmentBasePath={`${basePath}/shipments`} showSender />
  );
};

export default BulkBatchDetailView;
