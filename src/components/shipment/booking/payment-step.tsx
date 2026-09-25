import { PAYMENT_METHODS } from '@/lib/types';

import type { UseFormReturn } from 'react-hook-form';
import type { BookingInput } from '@/lib/shipment/schemas';

const PAYMENT_METHOD_COPY: Record<(typeof PAYMENT_METHODS)[number], { label: string; description: string }> = {
  card: {
    label: 'Card',
    description: 'Pay now with a debit or credit card.',
  },
  cod: {
    label: 'Cash on Delivery',
    description: 'Pay the driver when your package arrives.',
  },
};

type PaymentStepProps = {
  form: UseFormReturn<BookingInput>;
};

const PaymentStep = ({ form }: PaymentStepProps) => {
  const { register, watch } = form;
  const selected = watch('paymentMethod');

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Payment method</h2>

      <div className="flex flex-col gap-2">
        {PAYMENT_METHODS.map((method) => (
          <label
            key={method}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 ${
              selected === method ? 'border-primary bg-secondary/50' : 'border-input'
            }`}
          >
            <input type="radio" value={method} className="mt-1" {...register('paymentMethod')} />
            <span>
              <span className="block font-medium">{PAYMENT_METHOD_COPY[method].label}</span>
              <span className="block text-sm text-muted-foreground">
                {PAYMENT_METHOD_COPY[method].description}
              </span>
            </span>
          </label>
        ))}
      </div>

      {selected === 'card' ? (
        <p className="text-sm text-muted-foreground">
          Card payments aren&apos;t live in this build yet — your booking will be saved as pending
          payment until a real payment provider is connected.
        </p>
      ) : null}
    </div>
  );
};

export default PaymentStep;
