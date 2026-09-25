import ActivityView from '@/components/staff-views/activity-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerActivityPage = async () => {
  await requireRoleOrRedirect('manager');
  return <ActivityView />;
};

export default ManagerActivityPage;
