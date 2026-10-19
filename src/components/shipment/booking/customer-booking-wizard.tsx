'use client';

import BookingWizard from '@/components/shipment/booking/booking-wizard';
import { createBookingAction } from '@/lib/shipment/actions';

import type { AccountType, DeliveryType, PaymentMethod, PricingRule } from '@/lib/types';

type CustomerBookingWizardProps = {
  customerId: string;
  accountType: AccountType;
  rules: Record<DeliveryType, PricingRule>;
  // From the server (lib/payments): cash only while card payments are off.
  paymentMethods: PaymentMethod[];
};

const CustomerBookingWizard = ({ customerId, accountType, rules, paymentMethods }: CustomerBookingWizardProps) => {
  return (
    <BookingWizard
      uploaderId={customerId}
      rules={rules}
      accountType={accountType}
      paymentMethods={paymentMethods}
      onSubmit={createBookingAction}
      supportHref="/dashboard/customer/support/new"
      getSuccessPath={(result) => {
        if (!result.batchId) return `/dashboard/customer/deliveries/${result.shipmentIds[0]}?booked=1`;
        const params = new URLSearchParams({ booking: result.batchId, booked: '1' });
        if (result.failed.length) params.set('failed', String(result.failed.length));
        return `/dashboard/customer/deliveries?${params}`;
      }}
    />
  );
};

export default CustomerBookingWizard;
