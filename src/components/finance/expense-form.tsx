'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import { createExpenseAction, updateExpenseAction } from '@/lib/finance/actions';
import { createClient } from '@/lib/supabase/client';

import type { ExpensePaymentStatus } from '@/lib/finance/schemas';

export type ExpenseFormValues = {
  categoryId: string;
  description: string;
  amount: string;
  incurredOn: string;
  paymentStatus: ExpensePaymentStatus;
  paidOn: string;
  vendor: string;
  reference: string;
  notes: string;
  // The receipt already attached (expense-receipts bucket path), if any.
  receiptPath?: string | null;
};

// What the expense-receipts bucket accepts (migration 0052).
const RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

type ExpenseFormProps = {
  categories: { id: string; name: string; active: boolean }[];
  today: string;
  // Editing an existing expense; otherwise a new one.
  expenseId?: string;
  initial?: ExpenseFormValues;
  onDone?: () => void;
  // The signed-in user's id: shows a receipt upload into their own folder
  // of the private expense-receipts bucket (operators; migration 0052).
  receiptFolder?: string;
};

const textareaClass =
  'w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm';

// Records or edits an expense. The database records who did it and when,
// and keeps the before/after in the audit log (migration 0044).
const ExpenseForm = ({ categories, today, expenseId, initial, onDone, receiptFolder }: ExpenseFormProps) => {
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
    reference: '',
    notes: '',
  };
  const [values, setValues] = useState<ExpenseFormValues>(initial ?? blank);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [receiptPath, setReceiptPath] = useState<string | null>(initial?.receiptPath ?? null);
  const [receiptChanged, setReceiptChanged] = useState(false);
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const inFlight = useRef(false);

  // Straight to Storage, into the user's own folder: the bucket's RLS
  // refuses any other path, and the bucket enforces size and type.
  const uploadReceipt = async (file: File) => {
    if (!receiptFolder) return;
    setError(null);
    if (!RECEIPT_TYPES.includes(file.type)) {
      setError('finance.expenses.form.receiptType');
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setError('finance.expenses.form.receiptSize');
      return;
    }
    setIsUploading(true);
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
    const path = `${receiptFolder}/receipt-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await createClient().storage.from('expense-receipts').upload(path, file, { contentType: file.type });
    setIsUploading(false);
    if (uploadError) {
      setError('finance.expenses.form.receiptFailed');
      return;
    }
    setReceiptPath(path);
    setReceiptName(file.name);
    setReceiptChanged(true);
  };
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
      reference: values.reference || undefined,
      notes: values.notes || undefined,
      // Sent only when it changed: an edit otherwise keeps the receipt.
      ...(receiptFolder && (receiptChanged || !expenseId) ? { receiptPath } : {}),
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
    if (!expenseId) {
      setValues({ ...blank, categoryId: values.categoryId });
      setReceiptPath(null);
      setReceiptName(null);
      setReceiptChanged(false);
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-reference`}>
            {t('reference')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
          </Label>
          <Input id={`${ids}-reference`} maxLength={100} value={values.reference} onChange={(e) => set('reference', e.target.value)} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`${ids}-notes`}>
            {t('notes')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
          </Label>
          <textarea id={`${ids}-notes`} rows={2} maxLength={1000} value={values.notes} onChange={(e) => set('notes', e.target.value)} className={textareaClass} />
        </div>
        {receiptFolder ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={`${ids}-receipt`}>
              {t('receipt')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
            </Label>
            <input
              id={`${ids}-receipt`}
              type="file"
              accept={RECEIPT_TYPES.join(',')}
              disabled={isUploading || isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadReceipt(file);
                e.target.value = '';
              }}
              className="text-sm file:me-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {isUploading
                ? t('receiptUploading')
                : receiptPath
                  ? t('receiptAttached', { name: receiptName ?? t('receiptExisting') })
                  : t('receiptHint')}
            </p>
            {receiptPath && !isUploading ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() => {
                  setReceiptPath(null);
                  setReceiptName(null);
                  setReceiptChanged(true);
                }}
              >
                {t('receiptRemove')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <FieldError message={error} />
      {done ? (
        <p role="status" className="text-sm font-medium text-primary">
          {t('saved')}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || isUploading}>
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
