'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
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
import {
  approveExpenseReportAction,
  correctExpenseAction,
  discardExpenseReportAction,
  returnExpenseReportAction,
  submitExpenseReportAction,
} from '@/lib/finance/expense-report-actions';

import type { ExpenseReportResult } from '@/lib/finance/expense-report-actions';

// The steps of an operator expense report (migration 0052). The database
// decides whether each is allowed now; these only ask and show the answer.

const textareaClass =
  'w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm';

const failed = () => ({ success: false as const, error: 'errors.generic' });

const useStep = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const run = async (step: () => Promise<ExpenseReportResult>, after?: (result: ExpenseReportResult) => void) => {
    if (isPending) return false;
    setIsPending(true);
    setError(null);
    const result = await step().catch(failed);
    setIsPending(false);
    if (!result.success) {
      setError(result.error);
      return false;
    }
    after?.(result);
    router.refresh();
    return true;
  };
  return { error, isPending, run, router };
};

// ── Operator: submit (or resubmit), and discard a never-submitted draft ───
export const OperatorReportActions = ({
  reportId,
  canSubmit,
  canDiscard,
  resubmit,
  expensesHref,
}: {
  reportId: string;
  canSubmit: boolean;
  canDiscard: boolean;
  resubmit: boolean;
  expensesHref: string;
}) => {
  const t = useTranslations('finance.reports.operator');
  const { error, isPending, run, router } = useStep();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canSubmit ? (
          <Dialog open={open} onOpenChange={(next) => (isPending ? null : setOpen(next))}>
            <DialogTrigger asChild>
              <Button type="button">{resubmit ? t('resubmit') : t('submit')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{resubmit ? t('resubmitTitle') : t('submitTitle')}</DialogTitle>
                <DialogDescription>{t('submitDescription')}</DialogDescription>
              </DialogHeader>
              <FieldError message={error} />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isPending}>
                    {t('cancel')}
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={async () => {
                    if (await run(() => submitExpenseReportAction(reportId))) setOpen(false);
                  }}
                >
                  {isPending ? t('submitting') : t('confirmSubmit')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
        {canDiscard ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={async () => {
              if (!window.confirm(t('discardConfirm'))) return;
              await run(() => discardExpenseReportAction(reportId), () => router.push(expensesHref));
            }}
          >
            {t('discard')}
          </Button>
        ) : null}
      </div>
      {!open ? <FieldError message={error} /> : null}
    </div>
  );
};

// ── Manager: approve, or return with a reason ─────────────────────────────
export const ManagerReportReview = ({ reportId }: { reportId: string }) => {
  const t = useTranslations('finance.reports.review');
  const ids = useId();
  const { error, isPending, run } = useStep();
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [returnOpen, setReturnOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="text-base font-medium">{t('heading')}</h2>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-note`}>
          {t('note')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
        </Label>
        <Input id={`${ids}-note`} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={isPending} onClick={() => run(() => approveExpenseReportAction({ reportId, note }))}>
          {isPending ? t('working') : t('approve')}
        </Button>
        <Dialog open={returnOpen} onOpenChange={(next) => (isPending ? null : setReturnOpen(next))}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              {t('return')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (await run(() => returnExpenseReportAction({ reportId, reason }))) setReturnOpen(false);
              }}
            >
              <DialogHeader>
                <DialogTitle>{t('returnTitle')}</DialogTitle>
                <DialogDescription>{t('returnDescription')}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-reason`}>{t('reason')}</Label>
                <textarea
                  id={`${ids}-reason`}
                  rows={3}
                  minLength={5}
                  maxLength={1000}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={textareaClass}
                />
              </div>
              <FieldError message={error} />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isPending}>
                    {t('cancel')}
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isPending || reason.trim().length < 5}>
                  {t('confirmReturn')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-xs text-muted-foreground">{t('approvalMeaning')}</p>
      {!returnOpen ? <FieldError message={error} /> : null}
    </div>
  );
};

// ── Manager: correct an expense in an approved report ─────────────────────
export const ExpenseCorrectionDialog = ({ expenseId, description, amount }: { expenseId: string; description: string; amount: number }) => {
  const t = useTranslations('finance.reports.correction');
  const ids = useId();
  const { error, isPending, run } = useStep();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(amount.toFixed(2));
  const [reason, setReason] = useState('');
  const requestId = useRef(crypto.randomUUID());

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        setOpen(next);
        if (next) requestId.current = crypto.randomUUID();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const corrected = Number(value.replace(/,/g, '').trim());
            if (await run(() => correctExpenseAction({ expenseId, amount: corrected, reason, requestId: requestId.current }))) setOpen(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description', { description })}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-amount`}>{t('amount')}</Label>
            <Input id={`${ids}-amount`} inputMode="decimal" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-reason`}>{t('reason')}</Label>
            <textarea id={`${ids}-reason`} rows={2} minLength={5} maxLength={500} required value={reason} onChange={(e) => setReason(e.target.value)} className={textareaClass} />
          </div>
          <p className="text-xs text-muted-foreground">{t('kept')}</p>
          <FieldError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending || reason.trim().length < 5}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
