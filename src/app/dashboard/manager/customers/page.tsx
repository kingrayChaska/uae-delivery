import CustomersView from '@/components/staff-views/customers-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerCustomersPage = async () => {
  await requireRoleOrRedirect('manager');
  return <CustomersView basePath="/dashboard/manager" />;
};

export default ManagerCustomersPage;
