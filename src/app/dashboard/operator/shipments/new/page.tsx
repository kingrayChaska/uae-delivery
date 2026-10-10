import NewShipmentView, { parseBookingFor } from '@/components/staff-views/new-shipment-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorNewShipmentPage = async ({ searchParams }: { searchParams: Promise<{ for?: string | string[] }> }) => {
  const profile = await requireRoleOrRedirect('operator');
  const params = await searchParams;
  return (
    <NewShipmentView basePath="/dashboard/operator" actorId={profile.id} initialFor={parseBookingFor(params.for)} />
  );
};

export default OperatorNewShipmentPage;
