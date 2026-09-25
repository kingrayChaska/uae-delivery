import NewShipmentView from '@/components/staff-views/new-shipment-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorNewShipmentPage = async () => {
  const profile = await requireRoleOrRedirect('operator');
  return <NewShipmentView basePath="/dashboard/operator" actorId={profile.id} />;
};

export default OperatorNewShipmentPage;
