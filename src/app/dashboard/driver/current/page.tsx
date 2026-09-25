import { redirect } from 'next/navigation';

import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getDriverDashboardSummary } from '@/services/shipments/list-driver-shipments';

const CurrentDeliveryPage = async () => {
  const profile = await requireRoleOrRedirect('driver');
  const summary = await getDriverDashboardSummary(profile.id);

  if (summary.currentShipmentId) {
    redirect(`/dashboard/driver/deliveries/${summary.currentShipmentId}`);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="font-medium">No current delivery</p>
      <p className="text-sm text-muted-foreground">You&apos;ll see your next assignment here.</p>
    </main>
  );
};

export default CurrentDeliveryPage;
