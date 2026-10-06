'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import ConfirmButton from '@/components/ui/confirm-button';
import Label from '@/components/ui/label';
import { markReturnedAction } from '@/lib/dispatch/actions';

const MarkReturnedButton = ({ shipmentId }: { shipmentId: string }) => {
  const t = useTranslations('operator.shipmentDetail');
  const router = useRouter();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('operator.validation.reason');
      return false;
    }

    setIsPending(true);
    setError(null);
    const result = await markReturnedAction({ shipmentId, reason });
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
      title={t('markReturnedTitle')}
      description={
        <div className="flex flex-col gap-3">
          <p>{t('markReturnedDescription')}</p>
          <div className="flex flex-col gap-1.5 text-foreground">
            <Label htmlFor={reasonId}>{t('reasonLabel')}</Label>
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
      confirmLabel={t('markReturnedConfirm')}
      isPending={isPending}
      error={error}
      onConfirm={handleConfirm}
    >
      {isPending ? t('marking') : t('markReturned')}
    </ConfirmButton>
  );
};

export default MarkReturnedButton;
