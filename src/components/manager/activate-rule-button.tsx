'use client';

import Button from '@/components/ui/button';
import { activatePricingRuleAction } from '@/lib/pricing/actions';
import { useServerAction } from '@/lib/hooks/use-server-action';

const ActivateRuleButton = ({ ruleId }: { ruleId: string }) => {
  const { run, isPending, error } = useServerAction();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          if (confirm('Make this the active pricing rule? New bookings will be priced with it immediately.')) {
            run(() => activatePricingRuleAction(ruleId));
          }
        }}
      >
        Activate
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
};

export default ActivateRuleButton;
