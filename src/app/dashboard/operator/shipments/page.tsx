import ShipmentsView from '@/components/staff-views/shipments-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorShipmentsPage = async () => {
  await requireRoleOrRedirect('operator');
  return <ShipmentsView basePath="/dashboard/operator" />;
};

export default OperatorShipmentsPage;
