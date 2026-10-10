import NewShipmentView, { parseBookingFor } from '@/components/staff-views/new-shipment-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerNewShipmentPage = async ({ searchParams }: { searchParams: Promise<{ for?: string | string[] }> }) => {
  const profile = await requireRoleOrRedirect('manager');
  const params = await searchParams;
  return (
    <NewShipmentView basePath="/dashboard/manager" actorId={profile.id} initialFor={parseBookingFor(params.for)} />
  );
};

export default ManagerNewShipmentPage;
