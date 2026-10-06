import CustomersView from '@/components/staff-views/customers-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { normalizeCustomerSearch } from '@/lib/customers/search';

const ManagerCustomersPage = async ({ searchParams }: { searchParams: Promise<{ page?: string | string[]; q?: string | string[] }> }) => {
  await requireRoleOrRedirect('manager');
  const { page, q } = await searchParams;
  return <CustomersView basePath="/dashboard/manager" page={parsePage(page)} query={normalizeCustomerSearch(q)} />;
};

export default ManagerCustomersPage;
