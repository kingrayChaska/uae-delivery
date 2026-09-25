import ShipmentDetailView from '@/components/staff-views/shipment-detail-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorShipmentDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('operator');
  const { id } = await params;
  return <ShipmentDetailView basePath="/dashboard/operator" id={id} />;
};

export default OperatorShipmentDetailPage;
