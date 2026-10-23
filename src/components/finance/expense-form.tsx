'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import ReceiptPicker, { useReceiptUploads } from '@/components/finance/receipt-picker';
import ReceiptThumbnails from '@/components/finance/receipt-thumbnails';
import { createExpenseAction, updateExpenseAction } from '@/lib/finance/actions';

import type { ExpensePaymentStatus } from '@/lib/finance/schemas';
import type { ExpenseReceipt } from '@/lib/finance/receipt-files';

export type ExpenseFormValues = {
  categoryId: string;
  description: string;
  amount: string;
  incurredOn: string;
  paymentStatus: ExpensePaymentStatus;
  paidOn: string;
  vendor: string;
  notes: string;
  // A reference number typed before receipt pictures replaced it (shown,
  // never edited; migration 0053).
  legacyReference?: string | null;
  // The receipts already attached, with signed links for their previews.
  receipts?: ExpenseReceipt[];
};

type ExpenseFormProps = {
  categories: { id: string; name: string; active: boolean }[];
  today: string;
  // Editing an existing expense; otherwise a new one.
  expenseId?: string;
  initial?: ExpenseFormValues;
  onDone?: () => void;
  // Receipts are the recorder's own files: a colleague editing the expense
  // sees them but can't change them (the database refuses it too).
  canEditReceipts?: boolean;
};

const textareaClass =
  'w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm';

// Records or edits an expense, with its receipt pictures. The database
// records who did it and when, checks every receipt is the recorder's own
// upload, and keeps the before/after in the audit log (migrations 0044, 0053).
const ExpenseForm = ({ categories, today, expenseId, initial, onDone, canEditReceipts = true }: ExpenseFormProps) => {
  const t = useTranslations('finance.expenses.form');
  const router = useRouter();
  const ids = useId();
  const blank: ExpenseFormValues = {
    categoryId: '',
    description: '',
    amount: '',
    incurredOn: today,
    paymentStatus: 'paid',
    paidOn: today,
    vendor: '',
    notes: '',
  };
  const [values, setValues] = useState<ExpenseFormValues>(initial ?? blank);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const uploads = useReceiptUploads(initial?.receipts);
  const inFlight = useRef(false);

  const set = <K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  // An inactive category stays selectable only for an expense already in it.
  const options = categories.filter((c) => c.active || c.id === initial?.categoryId);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const amount = Number(values.amount.replace(/,/g, '').trim());
    if (!values.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('finance.validation.amount');
      return;
    }
    if (uploads.busy) {
      setError('finance.receipts.wait');
      return;
    }
    if (uploads.failed) {
      setError('finance.receipts.fixFailed');
      return;
    }
    inFlight.current = true;
    setIsPending(true);
    setError(null);
    setDone(false);
    const input = {
      categoryId: values.categoryId,
      description: values.description,
      amount,
      incurredOn: values.incurredOn,
      paymentStatus: values.paymentStatus,
      paidOn: values.paymentStatus === 'paid' ? values.paidOn || undefined : undefined,
      vendor: values.vendor || undefined,
      notes: values.notes || undefined,
      // Sent only when they changed: an edit otherwise keeps its receipts
      // (and a colleague's edit never touches the recorder's files).
      ...(canEditReceipts && (uploads.changed || !expenseId) ? { receipts: uploads.receipts } : {}),
    };
    const result = await (expenseId ? updateExpenseAction(expenseId, input) : createExpenseAction(input)).catch(() => ({
      success: false as const,
      error: 'finance.errors.saveFailed',
    }));
    inFlight.current = false;
    setIsPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    uploads.commit();
    if (!expenseId) {
      setValues({ ...blank, categoryId: values.categoryId });
      uploads.reset();
      setDone(true);
    }
    router.refresh();
    onDone?.();
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-category`}>{t('category')}</Label>
          <Select id={`${ids}-category`} value={values.categoryId} onChange={(e) => set('categoryId', e.target.value)} aria-required>
            <option value="">{t('chooseCategory')}</option>
            {options.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-amount`}>{t('amount')}</Label>
          <Input
            id={`${ids}-amount`}
            inputMode="decimal"
            dir="ltr"
            placeholder="0.00"
            value={values.amount}
            onChange={(e) => set('amount', e.target.value)}
            aria-required
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`${ids}-description`}>{t('description')}</Label>
          <Input
            id={`${ids}-description`}
            maxLength={200}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            aria-required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-incurred`}>{t('incurredOn')}</Label>
          <Input id={`${ids}-incurred`} type="date" max={today} value={values.incurredOn} onChange={(e) => set('incurredOn', e.target.value)} aria-required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-payment`}>{t('paymentStatus')}</Label>
          <Select
            id={`${ids}-payment`}
            value={values.paymentStatus}
            onChange={(e) => set('paymentStatus', e.target.value as ExpensePaymentStatus)}
          >
            <option value="paid">{t('paid')}</option>
            <option value="unpaid">{t('unpaid')}</option>
          </Select>
        </div>
        {values.paymentStatus === 'paid' ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-paid-on`}>
              {t('paidOn')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
            </Label>
            <Input id={`${ids}-paid-on`} type="date" value={values.paidOn} onChange={(e) => set('paidOn', e.target.value)} />
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-vendor`}>
            {t('vendor')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
          </Label>
          <Input id={`${ids}-vendor`} maxLength={120} value={values.vendor} onChange={(e) => set('vendor', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`${ids}-notes`}>
            {t('notes')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
          </Label>
          <textarea id={`${ids}-notes`} rows={2} maxLength={1000} value={values.notes} onChange={(e) => set('notes', e.target.value)} className={textareaClass} />
        </div>
        {initial?.legacyReference ? (
          <p className="text-sm text-muted-foreground sm:col-span-2">{t('legacyReference', { reference: initial.legacyReference })}</p>
        ) : null}
        <div className="sm:col-span-2">
          {canEditReceipts ? (
            <ReceiptPicker uploads={uploads} disabled={isPending} />
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t('receiptsReadOnly')}</p>
              {initial?.receipts?.length ? <ReceiptThumbnails receipts={initial.receipts} /> : <p className="text-xs text-muted-foreground">{t('noReceipts')}</p>}
            </div>
          )}
        </div>
      </div>
      <FieldError message={error} />
      {done ? (
        <p role="status" className="text-sm font-medium text-primary">
          {t('saved')}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || uploads.busy}>
          {isPending ? t('saving') : t('submit')}
        </Button>
        {onDone ? (
          <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
            {t('cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
};

export default ExpenseForm;
