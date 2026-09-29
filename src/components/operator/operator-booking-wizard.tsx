'use client';

import { useState } from 'react';

import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import BookingWizard from '@/components/shipment/booking/booking-wizard';
import { createBookingForCustomerAction } from '@/lib/shipment/actions';

import type { AccountType, PricingRuleSet } from '@/lib/types';

type CustomerOption = { id: string; fullName: string; email: string; accountType: AccountType };

type OperatorBookingWizardProps = {
  operatorId: string;
  rules: PricingRuleSet;
  customers: CustomerOption[];
  basePath?: string;
};

const OperatorBookingWizard = ({
  operatorId,
  rules,
  customers,
  basePath = '/dashboard/operator',
}: OperatorBookingWizardProps) => {
  const [customerId, setCustomerId] = useState('');
  const customer = customers.find((option) => option.id === customerId);
  // Quotes follow the selected customer's account type; the server prices
  // the booking from the customer's real account type either way.
  const accountType: AccountType = customer?.accountType ?? 'individual';

  const header = (
    <div className="flex flex-col gap-1.5 rounded-2xl border bg-card p-4 shadow-sm">
      <Label htmlFor="customer">Booking on behalf of</Label>
      <Select id="customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
        <option value="">Select a customer…</option>
        {customers.map((option) => (
          <option key={option.id} value={option.id}>
            {option.fullName} — {option.email}
            {option.accountType === 'merchant' ? ' (merchant)' : ''}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <BookingWizard
      // Switching between an individual and a merchant changes the rules
      // and whether weight is required, so start the booking over.
      key={accountType}
      uploaderId={operatorId}
      rules={rules[accountType]}
      accountType={accountType}
      header={header}
      validateBeforeSubmit={() => (customerId ? null : 'Select the customer this booking is for')}
      onSubmit={(input) => createBookingForCustomerAction(customerId, input)}
      getSuccessPath={(result) =>
        result.batchId ? `${basePath}/bulk/${result.batchId}` : `${basePath}/shipments/${result.shipmentIds[0]}`
      }
    />
  );
};

export default OperatorBookingWizard;
