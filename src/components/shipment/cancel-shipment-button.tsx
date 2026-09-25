'use client';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import { useCancelShipment } from '@/lib/hooks/use-cancel-shipment';

const CancelShipmentButton = ({ shipmentId }: { shipmentId: string }) => {
  const { cancel, isCancelling, error } = useCancelShipment(shipmentId);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        className="border-destructive text-destructive hover:bg-destructive/10"
        disabled={isCancelling}
        onClick={() => {
          if (confirm('Cancel this delivery?')) cancel();
        }}
      >
        {isCancelling ? 'Cancelling…' : 'Cancel Delivery'}
      </Button>
      {error ? <FieldError message={error} /> : null}
    </div>
  );
};

export default CancelShipmentButton;
