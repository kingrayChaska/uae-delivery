import SupportView from '@/components/staff-views/support-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerSupportPage = async () => {
  await requireRoleOrRedirect('manager');
  return <SupportView basePath="/dashboard/manager" />;
};

export default ManagerSupportPage;
