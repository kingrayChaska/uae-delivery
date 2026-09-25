import DriversView from '@/components/staff-views/drivers-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorDriversPage = async () => {
  await requireRoleOrRedirect('operator');
  return <DriversView />;
};

export default OperatorDriversPage;
