import BulkBatchDetailView from '@/components/staff-views/bulk-batch-detail-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';

import type { PageSearchParams } from '@/lib/pagination';

const OperatorBulkDetailPage = async ({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('operator');
  const [{ id }, { page }] = await Promise.all([params, searchParams]);
  return <BulkBatchDetailView basePath="/dashboard/operator" id={id} page={parsePage(page)} />;
};

export default OperatorBulkDetailPage;
