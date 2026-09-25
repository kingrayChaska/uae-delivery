import ShipmentsView from '@/components/staff-views/shipments-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerShipmentsPage = async () => {
  await requireRoleOrRedirect('manager');
  return <ShipmentsView basePath="/dashboard/manager" />;
};

export default ManagerShipmentsPage;
