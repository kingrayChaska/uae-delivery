import ShipmentLabelView from '@/components/staff-views/shipment-label-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerShipmentLabelPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { id } = await params;
  return <ShipmentLabelView basePath="/dashboard/manager" id={id} />;
};

export default ManagerShipmentLabelPage;
