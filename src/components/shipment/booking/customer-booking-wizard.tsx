'use client';

import BookingWizard from '@/components/shipment/booking/booking-wizard';
import { createShipmentAction } from '@/lib/shipment/actions';

import type { PricingRule } from '@/lib/types';

type CustomerBookingWizardProps = {
  customerId: string;
  activeRule: PricingRule;
};

const CustomerBookingWizard = ({ customerId, activeRule }: CustomerBookingWizardProps) => {
  return (
    <BookingWizard
      uploaderId={customerId}
      activeRule={activeRule}
      onSubmit={createShipmentAction}
      getSuccessPath={(id) => `/dashboard/customer/deliveries/${id}`}
    />
  );
};

export default CustomerBookingWizard;
