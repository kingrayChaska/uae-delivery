'use client';

import ConfirmButton from '@/components/ui/confirm-button';
import { activatePricingRuleAction } from '@/lib/pricing/actions';
import { useServerAction } from '@/lib/hooks/use-server-action';

const ActivateRuleButton = ({ ruleId }: { ruleId: string }) => {
  const { run, isPending, error } = useServerAction();

  return (
    <ConfirmButton
      size="sm"
      variant="outline"
      title="Activate this pricing rule?"
      description="New bookings for this account type and service are priced with it immediately. Existing shipments keep their original price."
      confirmLabel="Activate rule"
      isPending={isPending}
      error={error}
      onConfirm={() => run(() => activatePricingRuleAction(ruleId))}
    >
      Activate
    </ConfirmButton>
  );
};

export default ActivateRuleButton;
