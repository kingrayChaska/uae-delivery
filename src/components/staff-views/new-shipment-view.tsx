import OperatorBookingWizard from '@/components/operator/operator-booking-wizard';
import { getActivePricingRule } from '@/lib/pricing/get-active-rule';
import { listCustomers } from '@/services/customers/list-customers';

import type { StaffActorViewProps } from '@/components/staff-views/types';

const NewShipmentView = async ({ basePath, actorId }: StaffActorViewProps) => {
  const [activeRule, customers] = await Promise.all([getActivePricingRule(), listCustomers()]);

  return (
    <OperatorBookingWizard
      operatorId={actorId}
      basePath={basePath}
      activeRule={activeRule}
      customers={customers
        .filter((customer) => customer.active)
        .map((customer) => ({ id: customer.id, fullName: customer.fullName, email: customer.email }))}
    />
  );
};

export default NewShipmentView;
