'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import ConfirmButton from '@/components/ui/confirm-button';
import Label from '@/components/ui/label';
import { decideRemittanceAction } from '@/lib/cash/actions';
import { useFormat } from '@/i18n/hooks';

type RemittanceDecisionProps = { remittanceId: string; amount: number };

// A manager confirms a pending remittance (it then reduces the driver's
// balance) or rejects it with a reason (it never counts).
const RemittanceDecision = ({ remittanceId, amount }: RemittanceDecisionProps) => {
  const t = useTranslations('operator.cash.decision');
  const format = useFormat();
  const router = useRouter();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<'confirmed' | 'rejected' | null>(null);
  // Shown in the dialog whose action failed.
  const [error, setError] = useState<{ decision: 'confirmed' | 'rejected'; message: string } | null>(null);

  const decide = async (decision: 'confirmed' | 'rejected') => {
    if (decision === 'rejected' && !note.trim()) {
      setError({ decision, message: 'operator.cash.validation.rejectReason' });
      return false;
    }
    setPending(decision);
    setError(null);
    const result = await decideRemittanceAction({ remittanceId, decision, note: note || undefined }).catch(() => ({
      success: false as const,
      error: 'errors.generic',
    }));
    setPending(null);
    if (!result.success) {
      setError({ decision, message: result.error });
      router.refresh();
      return false;
    }
    router.refresh();
    return true;
  };

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <ConfirmButton
        size="sm"
        title={t('confirmTitle')}
        description={t('confirmDescription', { amount: format.money(amount) })}
        confirmLabel={t('confirm')}
        isPending={pending === 'confirmed'}
        error={error?.decision === 'confirmed' ? error.message : null}
        onConfirm={() => decide('confirmed')}
      >
        {t('confirm')}
      </ConfirmButton>
      <ConfirmButton
        size="sm"
        variant="outline"
        confirmVariant="destructive"
        title={t('rejectTitle')}
        description={
          <div className="flex flex-col gap-3">
            <p>{t('rejectDescription', { amount: format.money(amount) })}</p>
            <div className="flex flex-col gap-1.5 text-foreground">
              <Label htmlFor={noteId}>{t('rejectReason')}</Label>
              <textarea
                id={noteId}
                rows={3}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                aria-required
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
              />
            </div>
          </div>
        }
        confirmLabel={t('reject')}
        isPending={pending === 'rejected'}
        error={error?.decision === 'rejected' ? error.message : null}
        onConfirm={() => decide('rejected')}
      >
        {t('reject')}
      </ConfirmButton>
    </div>
  );
};

export default RemittanceDecision;
