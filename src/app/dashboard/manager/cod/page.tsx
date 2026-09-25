import CodView from '@/components/staff-views/cod-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerCodPage = async () => {
  await requireRoleOrRedirect('manager');
  return <CodView />;
};

export default ManagerCodPage;
