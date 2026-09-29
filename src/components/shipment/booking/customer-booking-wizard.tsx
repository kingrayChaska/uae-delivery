'use client';

import BookingWizard from '@/components/shipment/booking/booking-wizard';
import { createBookingAction } from '@/lib/shipment/actions';

import type { AccountType, DeliveryType, PricingRule } from '@/lib/types';

type CustomerBookingWizardProps = {
  customerId: string;
  accountType: AccountType;
  rules: Record<DeliveryType, PricingRule>;
};

const CustomerBookingWizard = ({ customerId, accountType, rules }: CustomerBookingWizardProps) => {
  return (
    <BookingWizard
      uploaderId={customerId}
      rules={rules}
      accountType={accountType}
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
