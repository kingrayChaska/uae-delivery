import CustomersView from '@/components/staff-views/customers-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';

import type { PageSearchParams } from '@/lib/pagination';

const ManagerCustomersPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('manager');
  const { page } = await searchParams;
  return <CustomersView basePath="/dashboard/manager" page={parsePage(page)} />;
};

export default ManagerCustomersPage;
