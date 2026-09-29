'use client';

import { useTranslations } from 'next-intl';

import ConfirmButton from '@/components/ui/confirm-button';
import { activatePricingRuleAction } from '@/lib/pricing/actions';
import { useServerAction } from '@/lib/hooks/use-server-action';

const ActivateRuleButton = ({ ruleId }: { ruleId: string }) => {
  const t = useTranslations('manager.pricing');
  const { run, isPending, error } = useServerAction();

  return (
    <ConfirmButton
      size="sm"
      variant="outline"
      title={t('activateTitle')}
      description={t('activateBody')}
      confirmLabel={t('activateConfirm')}
      isPending={isPending}
      error={error}
      onConfirm={() => run(() => activatePricingRuleAction(ruleId))}
    >
      {t('activate')}
    </ConfirmButton>
  );
};

export default ActivateRuleButton;
