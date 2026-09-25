import NewShipmentView from '@/components/staff-views/new-shipment-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerNewShipmentPage = async () => {
  const profile = await requireRoleOrRedirect('manager');
  return <NewShipmentView basePath="/dashboard/manager" actorId={profile.id} />;
};

export default ManagerNewShipmentPage;
