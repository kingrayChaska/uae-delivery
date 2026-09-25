'use client';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import { resetStaffAccessAction, setStaffActiveAction } from '@/lib/staff/actions';
import { useServerAction } from '@/lib/hooks/use-server-action';

type StaffAccessControlsProps = {
  profileId: string;
  active: boolean;
};

const StaffAccessControls = ({ profileId, active }: StaffAccessControlsProps) => {
  const { run, isPending, error, message } = useServerAction();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={active ? 'outline' : 'default'}
          className={active ? 'border-destructive text-destructive hover:bg-destructive/10' : undefined}
          disabled={isPending}
          onClick={() => {
            if (active && !confirm('Deactivate this account? They will be signed out and unable to log in.')) return;
            run(() => setStaffActiveAction(profileId, !active), active ? 'Account deactivated.' : 'Account reactivated.');
          }}
        >
          {active ? 'Deactivate' : 'Reactivate'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !active}
          onClick={() => run(() => resetStaffAccessAction(profileId), 'Password reset email sent.')}
        >
          Send password reset
        </Button>
      </div>
      <FieldError message={error ?? undefined} />
      {message ? <p className="text-sm text-success">{message}</p> : null}
    </div>
  );
};

export default StaffAccessControls;
