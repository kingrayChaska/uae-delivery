import { notFound } from 'next/navigation';

import BatchDetail from '@/components/bulk/batch-detail';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getBatchDetail } from '@/services/bulk/list-batches';

const CustomerBulkDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('customer');
  const { id } = await params;

  const batch = await getBatchDetail(id);
  if (!batch) notFound();

  return (
    <BatchDetail batch={batch} backHref="/dashboard/customer/bulk" shipmentBasePath="/dashboard/customer/deliveries" />
  );
};

export default CustomerBulkDetailPage;
