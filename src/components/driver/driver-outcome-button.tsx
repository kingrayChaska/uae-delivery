'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Undo2, XCircle } from 'lucide-react';

import ConfirmButton from '@/components/ui/confirm-button';
import Label from '@/components/ui/label';
import { cancelShipmentAsDriverAction, returnShipmentAction } from '@/lib/driver/actions';

type DriverOutcome = 'cancel' | 'return';

const ACTIONS = {
  cancel: cancelShipmentAsDriverAction,
  return: returnShipmentAction,
} as const;

// "Cancel shipment" (before pickup) or "Return to sender" (after pickup),
// each behind a confirmation that asks for the reason.
const DriverOutcomeButton = ({ shipmentId, outcome }: { shipmentId: string; outcome: DriverOutcome }) => {
  const t = useTranslations(`driver.outcome.${outcome}`);
  const router = useRouter();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = outcome === 'cancel' ? XCircle : Undo2;

  const confirm = async () => {
    if (!reason.trim()) {
      setError('driver.validation.reason');
      return false;
    }
    setIsPending(true);
    setError(null);
    const result = await ACTIONS[outcome]({ shipmentId, reason });
    setIsPending(false);
    if (!result.success) {
      setError(result.error);
      return false;
    }
    router.refresh();
    return true;
  };

  return (
    <ConfirmButton
      variant="outline"
      className="w-full border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
      title={t('title')}
      description={
        <div className="flex flex-col gap-3">
          <p>{t('description')}</p>
          <div className="flex flex-col gap-1.5 text-foreground">
            <Label htmlFor={reasonId}>{t('reason')}</Label>
            <textarea
              id={reasonId}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reasonPlaceholder')}
              aria-required
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
            />
          </div>
        </div>
      }
      confirmLabel={t('confirm')}
      confirmVariant="destructive"
      isPending={isPending}
      error={error}
      onConfirm={confirm}
    >
      <Icon aria-hidden />
      {t('button')}
    </ConfirmButton>
  );
};

export default DriverOutcomeButton;
