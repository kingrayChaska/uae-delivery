'use client';

import Button from '@/components/ui/button';
import ConfirmButton from '@/components/ui/confirm-button';
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
        {active ? (
          <ConfirmButton
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            title="Deactivate this account?"
            description="They will be signed out and unable to log in until the account is reactivated."
            confirmLabel="Deactivate"
            confirmVariant="destructive"
            isPending={isPending}
            onConfirm={() => run(() => setStaffActiveAction(profileId, false), 'Account deactivated.')}
          >
            Deactivate
          </ConfirmButton>
        ) : (
          <Button
            type="button"
            loading={isPending}
            onClick={() => run(() => setStaffActiveAction(profileId, true), 'Account reactivated.')}
          >
            Reactivate
          </Button>
        )}
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
      {message ? (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      ) : null}
    </div>
  );
};

export default StaffAccessControls;
