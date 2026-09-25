'use client';

import { useState } from 'react';

import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import BookingWizard from '@/components/shipment/booking/booking-wizard';
import { createShipmentForCustomerAction } from '@/lib/shipment/actions';

import type { PricingRule } from '@/lib/types';

type CustomerOption = { id: string; fullName: string; email: string };

type OperatorBookingWizardProps = {
  operatorId: string;
  activeRule: PricingRule;
  customers: CustomerOption[];
  basePath?: string;
};

const OperatorBookingWizard = ({
  operatorId,
  activeRule,
  customers,
  basePath = '/dashboard/operator',
}: OperatorBookingWizardProps) => {
  const [customerId, setCustomerId] = useState('');

  const header = (
    <div className="flex flex-col gap-1.5 rounded-md border p-4">
      <Label htmlFor="customer">Booking on behalf of</Label>
      <Select id="customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
        <option value="">Select a customer…</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.fullName} — {customer.email}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <BookingWizard
      uploaderId={operatorId}
      activeRule={activeRule}
      header={header}
      validateBeforeSubmit={() => (customerId ? null : 'Select the customer this booking is for')}
      onSubmit={(input) => createShipmentForCustomerAction(customerId, input)}
      getSuccessPath={(id) => `${basePath}/shipments/${id}`}
    />
  );
};

export default OperatorBookingWizard;
