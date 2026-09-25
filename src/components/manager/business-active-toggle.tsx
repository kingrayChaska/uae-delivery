'use client';

import Button from '@/components/ui/button';
import { setBusinessActiveAction } from '@/lib/business/actions';
import { useServerAction } from '@/lib/hooks/use-server-action';

const BusinessActiveToggle = ({ businessId, active }: { businessId: string; active: boolean }) => {
  const { run, isPending, error } = useServerAction();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => run(() => setBusinessActiveAction(businessId, !active))}
      >
        {active ? 'Deactivate account' : 'Reactivate account'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
};

export default BusinessActiveToggle;
