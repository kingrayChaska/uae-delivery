import ShipmentLabelView from '@/components/staff-views/shipment-label-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorShipmentLabelPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('operator');
  const { id } = await params;
  return <ShipmentLabelView basePath="/dashboard/operator" id={id} />;
};

export default OperatorShipmentLabelPage;
