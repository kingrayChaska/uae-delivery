'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import { setBusinessActiveAction } from '@/lib/business/actions';
import { useServerAction } from '@/lib/hooks/use-server-action';

const BusinessActiveToggle = ({ businessId, active }: { businessId: string; active: boolean }) => {
  const t = useTranslations('manager.business');
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
        {active ? t('deactivate') : t('reactivate')}
      </Button>
      <FieldError message={error} />
    </div>
  );
};

export default BusinessActiveToggle;
