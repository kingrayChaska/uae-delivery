import ActivityView from '@/components/staff-views/activity-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorActivityPage = async () => {
  await requireRoleOrRedirect('operator');
  return <ActivityView />;
};

export default OperatorActivityPage;
