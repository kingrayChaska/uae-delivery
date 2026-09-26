import CustomersView from '@/components/staff-views/customers-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';

import type { PageSearchParams } from '@/lib/pagination';

const OperatorCustomersPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('operator');
  const { page } = await searchParams;
  return <CustomersView basePath="/dashboard/operator" page={parsePage(page)} />;
};

export default OperatorCustomersPage;
