import OperatorBookingWizard from '@/components/operator/operator-booking-wizard';
import { getActivePricingRule } from '@/lib/pricing/get-active-rule';
import { listCustomerOptions } from '@/services/customers/list-customers';

import type { StaffActorViewProps } from '@/components/staff-views/types';

const NewShipmentView = async ({ basePath, actorId }: StaffActorViewProps) => {
  const [activeRule, customers] = await Promise.all([getActivePricingRule(), listCustomerOptions()]);

  return (
    <OperatorBookingWizard operatorId={actorId} basePath={basePath} activeRule={activeRule} customers={customers} />
  );
};

export default NewShipmentView;
