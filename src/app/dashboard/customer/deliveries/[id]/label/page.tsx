import { notFound } from 'next/navigation';

import ShipmentLabel from '@/components/shipment/label/shipment-label';
import PrintButton from '@/components/shipment/label/print-button';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getShipmentLabelData } from '@/services/qr/get-shipment-label-data';

const CustomerShipmentLabelPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('customer');
  const { id } = await params;

  const label = await getShipmentLabelData(id);
  if (!label) notFound();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6 print:p-0">
      <ShipmentLabel {...label} />
      <PrintButton />
    </main>
  );
};

export default CustomerShipmentLabelPage;
