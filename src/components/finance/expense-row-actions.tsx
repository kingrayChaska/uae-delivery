'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Label from '@/components/ui/label';
import ExpenseForm from '@/components/finance/expense-form';
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
import { voidExpenseAction } from '@/lib/finance/actions';

import type { ExpenseFormValues } from '@/components/finance/expense-form';

type ExpenseRowActionsProps = {
  expenseId: string;
  description: string;
  categories: { id: string; name: string; active: boolean }[];
  today: string;
  initial: ExpenseFormValues;
  // False when someone else recorded it: receipts are shown, not changed.
  canEditReceipts?: boolean;
};

// Edit or void one active expense. Expenses are never deleted: a void
// expense stays on record with its reason and stops counting in totals.
const ExpenseRowActions = ({ expenseId, description, categories, today, initial, canEditReceipts = true }: ExpenseRowActionsProps) => {
  const t = useTranslations('finance.expenses');
  const router = useRouter();
  const ids = useId();
  const [editOpen, setEditOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="ghost">
            {t('form.edit')}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('form.editHeading')}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <ExpenseForm
            categories={categories}
            today={today}
            expenseId={expenseId}
            initial={initial}
            onDone={() => setEditOpen(false)}
            canEditReceipts={canEditReceipts}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={(next) => (isPending ? null : setVoidOpen(next))}>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive">
            {t('void.button')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setIsPending(true);
              setError(null);
              const result = await voidExpenseAction({ expenseId, reason }).catch(() => ({ success: false as const, error: 'errors.generic' }));
              setIsPending(false);
              if (!result.success) {
                setError(result.error);
                return;
              }
              setVoidOpen(false);
              router.refresh();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('void.title')}</DialogTitle>
              <DialogDescription>{t('void.description', { description })}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-reason`}>{t('void.reason')}</Label>
              <textarea
                id={`${ids}-reason`}
                rows={2}
                minLength={5}
                maxLength={500}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
              />
            </div>
            <FieldError message={error} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isPending}>
                  {t('form.cancel')}
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive" disabled={isPending || reason.trim().length < 5}>
                {t('void.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExpenseRowActions;
