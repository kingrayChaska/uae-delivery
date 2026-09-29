'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import ConfirmButton from '@/components/ui/confirm-button';
import FieldError from '@/components/ui/field-error';
import { resetStaffAccessAction, setStaffActiveAction } from '@/lib/staff/actions';
import { useServerAction } from '@/lib/hooks/use-server-action';
import { useMessage } from '@/i18n/hooks';

type StaffAccessControlsProps = {
  profileId: string;
  active: boolean;
};

const StaffAccessControls = ({ profileId, active }: StaffAccessControlsProps) => {
  const t = useTranslations('manager.staff.accessControls');
  const translate = useMessage();
  const { run, isPending, error, message } = useServerAction();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {active ? (
          <ConfirmButton
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            title={t('deactivateTitle')}
            description={t('deactivateBody')}
            confirmLabel={t('deactivate')}
            confirmVariant="destructive"
            isPending={isPending}
            onConfirm={() => run(() => setStaffActiveAction(profileId, false), 'manager.staff.accessControls.deactivated')}
          >
            {t('deactivate')}
          </ConfirmButton>
        ) : (
          <Button
            type="button"
            loading={isPending}
            onClick={() => run(() => setStaffActiveAction(profileId, true), 'manager.staff.accessControls.reactivated')}
          >
            {t('reactivate')}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !active}
          onClick={() => run(() => resetStaffAccessAction(profileId), 'manager.staff.accessControls.resetSent')}
        >
          {t('reset')}
        </Button>
      </div>
      <FieldError message={error ?? undefined} />
      {message ? (
        <p role="status" className="text-sm text-success">
          {translate(message)}
        </p>
      ) : null}
    </div>
  );
};

export default StaffAccessControls;
