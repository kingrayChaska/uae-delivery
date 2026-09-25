import ShipmentDetailView from '@/components/staff-views/shipment-detail-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerShipmentDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { id } = await params;
  return <ShipmentDetailView basePath="/dashboard/manager" id={id} />;
};

export default ManagerShipmentDetailPage;
