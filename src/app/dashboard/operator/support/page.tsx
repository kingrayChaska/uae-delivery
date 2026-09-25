import SupportView from '@/components/staff-views/support-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorSupportPage = async () => {
  await requireRoleOrRedirect('operator');
  return <SupportView basePath="/dashboard/operator" />;
};

export default OperatorSupportPage;
