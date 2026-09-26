import BulkBatchesView from '@/components/staff-views/bulk-batches-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';

import type { PageSearchParams } from '@/lib/pagination';

const OperatorBulkPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('operator');
  const { page } = await searchParams;
  return <BulkBatchesView basePath="/dashboard/operator" page={parsePage(page)} />;
};

export default OperatorBulkPage;
