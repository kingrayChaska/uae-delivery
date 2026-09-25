import BulkBatchDetailView from '@/components/staff-views/bulk-batch-detail-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerBulkDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { id } = await params;
  return <BulkBatchDetailView basePath="/dashboard/manager" id={id} />;
};

export default ManagerBulkDetailPage;
