import BulkBatchesView from '@/components/staff-views/bulk-batches-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorBulkPage = async () => {
  await requireRoleOrRedirect('operator');
  return <BulkBatchesView basePath="/dashboard/operator" />;
};

export default OperatorBulkPage;
