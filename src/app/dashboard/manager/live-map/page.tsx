import LiveMapView from '@/components/staff-views/live-map-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerLiveMapPage = async () => {
  await requireRoleOrRedirect('manager');
  return <LiveMapView />;
};

export default ManagerLiveMapPage;
