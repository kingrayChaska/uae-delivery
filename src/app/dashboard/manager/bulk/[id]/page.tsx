import BulkBatchDetailView from '@/components/staff-views/bulk-batch-detail-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';

import type { PageSearchParams } from '@/lib/pagination';

const ManagerBulkDetailPage = async ({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('manager');
  const [{ id }, { page }] = await Promise.all([params, searchParams]);
  return <BulkBatchDetailView basePath="/dashboard/manager" id={id} page={parsePage(page)} />;
};

export default ManagerBulkDetailPage;
