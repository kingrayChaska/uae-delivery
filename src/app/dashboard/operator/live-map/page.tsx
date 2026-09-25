import LiveMapView from '@/components/staff-views/live-map-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorLiveMapPage = async () => {
  await requireRoleOrRedirect('operator');
  return <LiveMapView />;
};

export default OperatorLiveMapPage;
