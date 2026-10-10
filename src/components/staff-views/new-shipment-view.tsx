import OperatorBookingWizard from '@/components/operator/operator-booking-wizard';
import { getActivePricingRules } from '@/lib/pricing/get-active-rule';
import { listCustomerOptions } from '@/services/customers/list-customers';

import type { BookingFor } from '@/components/operator/operator-booking-wizard';
import type { StaffActorViewProps } from '@/components/staff-views/types';

// ?for=guest opens the form for a customer with no ParcelLink account.
export const parseBookingFor = (value: string | string[] | undefined): BookingFor =>
  value === 'guest' ? 'guest' : 'registered';

const NewShipmentView = async ({ basePath, actorId, initialFor }: StaffActorViewProps & { initialFor: BookingFor }) => {
  const [rules, customers] = await Promise.all([getActivePricingRules(), listCustomerOptions()]);

  return (
    <OperatorBookingWizard
      operatorId={actorId}
      basePath={basePath}
      rules={rules}
      customers={customers}
      initialFor={initialFor}
    />
  );
};

export default NewShipmentView;
