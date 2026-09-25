import BulkBatchesView from '@/components/staff-views/bulk-batches-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerBulkPage = async () => {
  await requireRoleOrRedirect('manager');
  return <BulkBatchesView basePath="/dashboard/manager" />;
};

export default ManagerBulkPage;
