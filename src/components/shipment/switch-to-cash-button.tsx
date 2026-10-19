'use client';

import { Banknote } from 'lucide-react';
import { useTranslations } from 'next-intl';

import ConfirmButton from '@/components/ui/confirm-button';
import { useServerAction } from '@/lib/hooks/use-server-action';
import { switchToCashAction } from '@/lib/shipment/actions';

// A card booking made before card payments were turned off waits at
// "pending payment" for a payment that can't be taken. This moves it to
// cash: it's confirmed for dispatch and the fee is collected in cash.
// Nothing is marked paid.
const SwitchToCashButton = ({ shipmentId }: { shipmentId: string }) => {
  const t = useTranslations('shipments.switchToCash');
  const { run, isPending, error } = useServerAction();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-secondary/50 p-3 text-sm" role="status">
      <p>{t('waiting')}</p>
      <ConfirmButton
        size="sm"
        className="self-start"
        title={t('title')}
        description={t('description')}
        confirmLabel={t('confirm')}
        isPending={isPending}
        error={error}
        onConfirm={() => run(() => switchToCashAction(shipmentId))}
      >
        <Banknote aria-hidden />
        {t('button')}
      </ConfirmButton>
    </div>
  );
};

export default SwitchToCashButton;
