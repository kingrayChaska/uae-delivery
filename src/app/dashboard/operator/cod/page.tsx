import CodView from '@/components/staff-views/cod-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorCodPage = async () => {
  await requireRoleOrRedirect('operator');
  return <CodView />;
};

export default OperatorCodPage;
