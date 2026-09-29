'use client';

import { XCircle } from 'lucide-react';

import ConfirmButton from '@/components/ui/confirm-button';
import { useCancelShipment } from '@/lib/hooks/use-cancel-shipment';

const CancelShipmentButton = ({ shipmentId }: { shipmentId: string }) => {
  const { cancel, isCancelling, error } = useCancelShipment(shipmentId);

  return (
    <ConfirmButton
      variant="outline"
      className="border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
      title="Cancel this delivery?"
      description="The pickup will be called off and the driver, if one is assigned, is told straight away. This can’t be undone."
      confirmLabel="Yes, cancel delivery"
      cancelLabel="Keep delivery"
      confirmVariant="destructive"
      isPending={isCancelling}
      error={error}
      onConfirm={cancel}
    >
      <XCircle aria-hidden />
      Cancel delivery
    </ConfirmButton>
  );
};

export default CancelShipmentButton;
