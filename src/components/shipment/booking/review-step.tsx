import { formatEta } from '@/lib/shipment/format';

import type { UseFormReturn } from 'react-hook-form';
import type { BookingInput } from '@/lib/shipment/schemas';
import type { PriceBreakdown } from '@/lib/types';

type ReviewStepProps = {
  form: UseFormReturn<BookingInput>;
  priceBreakdown: PriceBreakdown | null;
};

const ReviewStep = ({ form, priceBreakdown }: ReviewStepProps) => {
  const values = form.getValues();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Review your booking</h2>

      <div className="rounded-md border p-4">
        <p className="text-xs text-muted-foreground">Pickup</p>
        <p className="font-medium">{values.pickup.address}</p>
        <p className="text-sm text-muted-foreground">
          {values.pickup.contactName} · {values.pickup.contactPhone}
        </p>
      </div>

      <div className="rounded-md border p-4">
        <p className="text-xs text-muted-foreground">Delivery</p>
        <p className="font-medium">{values.dropoff.address}</p>
        <p className="text-sm text-muted-foreground">
          {values.dropoff.contactName} · {values.dropoff.contactPhone}
        </p>
      </div>

      {priceBreakdown ? (
        <div className="rounded-md border p-4 font-brand-mono text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Distance</span>
            <span>{priceBreakdown.distanceKm.toFixed(1)} km</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Estimated time</span>
            <span>{formatEta(priceBreakdown.durationMinutes)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t pt-2 text-base font-medium text-foreground">
            <span>Delivery Fee</span>
            <span>
              {priceBreakdown.currency} {priceBreakdown.totalPrice.toFixed(2)}
            </span>
          </div>
        </div>
      ) : null}

      <div className="rounded-md border p-4">
        <p className="text-xs text-muted-foreground">Package</p>
        <p>{values.packageDescription}</p>
        <p className="text-sm text-muted-foreground">
          Qty {values.packageQuantity}
          {values.packageWeightKg ? ` · ${values.packageWeightKg} kg` : ''}
          {values.isFragile ? ' · Fragile' : ''}
        </p>
      </div>
    </div>
  );
};

export default ReviewStep;
