import BulkBatchDetailView from '@/components/staff-views/bulk-batch-detail-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorBulkDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('operator');
  const { id } = await params;
  return <BulkBatchDetailView basePath="/dashboard/operator" id={id} />;
};

export default OperatorBulkDetailPage;
