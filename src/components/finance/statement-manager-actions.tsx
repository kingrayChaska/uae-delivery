'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import ConfirmButton from '@/components/ui/confirm-button';
import FieldError from '@/components/ui/field-error';
import Label from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { correctStatementAction, discardStatementAction, publishStatementAction } from '@/lib/finance/actions';

import type { FinanceActionResult } from '@/lib/finance/actions';
import type { StatementStatus } from '@/lib/finance/statements';

type StatementManagerActionsProps = {
  statementId: string;
  status: StatementStatus;
  merchantName: string;
};

const useAction = () => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<FinanceActionResult>): Promise<FinanceActionResult> => {
    setIsPending(true);
    setError(null);
    const result = await action().catch((): FinanceActionResult => ({ success: false, error: 'errors.generic' }));
    setIsPending(false);
    if (!result.success) setError(result.error);
    return result;
  };
  return { isPending, error, run };
};

// What a manager can do with a statement: publish or discard a draft, or
// issue a correction for a published one. Each is checked again by the
// database (migration 0044).
const StatementManagerActions = ({ statementId, status, merchantName }: StatementManagerActionsProps) => {
  const t = useTranslations('finance.statements.actions');
  const router = useRouter();
  const ids = useId();
  const publish = useAction();
  const discard = useAction();
  const correct = useAction();
  const [reason, setReason] = useState('');
  const [emailMerchant, setEmailMerchant] = useState(true);
  const [correctOpen, setCorrectOpen] = useState(false);

  if (status === 'draft') {
    return (
      <div className="flex flex-wrap gap-2">
        <ConfirmButton
          title={t('publishTitle')}
          description={
            <>
              {t('publishDescription', { merchant: merchantName })}
              <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0"
                  checked={emailMerchant}
                  onChange={(event) => setEmailMerchant(event.target.checked)}
                />
                <span>{t('emailMerchant')}</span>
              </label>
            </>
          }
          confirmLabel={publish.isPending ? t('publishing') : t('publishConfirm')}
          isPending={publish.isPending}
          error={publish.error}
          onConfirm={async () => {
            const { success } = await publish.run(() => publishStatementAction(statementId, emailMerchant));
            if (success) router.replace(`/dashboard/manager/statements/${statementId}?published=1`);
            return success;
          }}
        >
          {t('publish')}
        </ConfirmButton>
        <ConfirmButton
          variant="outline"
          confirmVariant="destructive"
          title={t('discardTitle')}
          description={t('discardDescription')}
          confirmLabel={t('discardConfirm')}
          isPending={discard.isPending}
          error={discard.error}
          onConfirm={async () => {
            const { success } = await discard.run(() => discardStatementAction(statementId));
            if (success) router.replace('/dashboard/manager/statements');
            return success;
          }}
        >
          {t('discard')}
        </ConfirmButton>
      </div>
    );
  }

  if (status !== 'published') return null;

  return (
    <Dialog open={correctOpen} onOpenChange={(next) => (correct.isPending ? null : setCorrectOpen(next))}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {t('correct')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await correct.run(() => correctStatementAction({ statementId, reason }));
            if (result.success) router.push(`/dashboard/manager/statements/${result.id}?generated=1`);
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{t('correctTitle')}</DialogTitle>
            <DialogDescription>{t('correctDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-reason`}>{t('correctReason')}</Label>
            <textarea
              id={`${ids}-reason`}
              rows={3}
              minLength={5}
              maxLength={500}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
            />
          </div>
          <FieldError message={correct.error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={correct.isPending}>
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={correct.isPending || reason.trim().length < 5}>
              {t('correctConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default StatementManagerActions;
