import OperatorBookingWizard from '@/components/operator/operator-booking-wizard';
import { getActivePricingRules } from '@/lib/pricing/get-active-rule';
import { listCustomerOptions } from '@/services/customers/list-customers';

import type { StaffActorViewProps } from '@/components/staff-views/types';

const NewShipmentView = async ({ basePath, actorId }: StaffActorViewProps) => {
  const [rules, customers] = await Promise.all([getActivePricingRules(), listCustomerOptions()]);

  return (
    <OperatorBookingWizard operatorId={actorId} basePath={basePath} rules={rules} customers={customers} />
  );
};

export default NewShipmentView;
