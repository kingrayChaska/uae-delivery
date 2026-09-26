import CustomerDetailView from '@/components/staff-views/customer-detail-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';

import type { PageSearchParams } from '@/lib/pagination';

const OperatorCustomerDetailPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: PageSearchParams;
}) => {
  await requireRoleOrRedirect('operator');
  const [{ id }, { page }] = await Promise.all([params, searchParams]);
  return <CustomerDetailView basePath="/dashboard/operator" id={id} page={parsePage(page)} />;
};

export default OperatorCustomerDetailPage;
