import CustomersView from '@/components/staff-views/customers-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorCustomersPage = async () => {
  await requireRoleOrRedirect('operator');
  return <CustomersView basePath="/dashboard/operator" />;
};

export default OperatorCustomersPage;
