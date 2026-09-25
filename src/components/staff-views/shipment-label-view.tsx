import { notFound } from 'next/navigation';

import ShipmentLabel from '@/components/shipment/label/shipment-label';
import PrintButton from '@/components/shipment/label/print-button';
import { getShipmentLabelData } from '@/services/qr/get-shipment-label-data';

import type { StaffDetailViewProps } from '@/components/staff-views/types';

const ShipmentLabelView = async ({ id }: StaffDetailViewProps) => {
  const label = await getShipmentLabelData(id);
  if (!label) notFound();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6 print:p-0">
      <ShipmentLabel {...label} />
      <PrintButton />
    </main>
  );
};

export default ShipmentLabelView;
