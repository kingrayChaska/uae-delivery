'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import { recordRemittanceAction } from '@/lib/cash/actions';
import { REMITTANCE_METHODS } from '@/lib/cash/schemas';
import { useFormat } from '@/i18n/hooks';

import type { RemittanceMethod } from '@/lib/cash/schemas';

type RecordRemittanceFormProps = {
  driverId: string;
  driverName: string;
  // Outstanding less what is already awaiting confirmation: the most that
  // can be recorded now. The database checks it again.
  available: number;
  // A manager's remittance counts at once; an operator's waits for one.
  confirmsImmediately: boolean;
  today: string;
};

const RecordRemittanceForm = ({ driverId, driverName, available, confirmsImmediately, today }: RecordRemittanceFormProps) => {
  const t = useTranslations('operator.cash.record');
  const tMethod = useTranslations('operator.cash.methods');
  const format = useFormat();
  const router = useRouter();
  const ids = useId();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<RemittanceMethod>('cash');
  const [receivedOn, setReceivedOn] = useState(today);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  // One id per submission, reused if the same submission is retried, so a
  // double click or a network retry can't record the cash twice.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const inFlight = useRef(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const value = Number(amount.replace(/,/g, '').trim());
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) {
      setError('operator.cash.validation.amount');
      return;
    }
    if (value > available) {
      setError('operator.cash.validation.moreThanOwed');
      return;
    }

    inFlight.current = true;
    setIsPending(true);
    setError(null);
    setDone(null);
    const result = await recordRemittanceAction({
      driverId,
      amount: value,
      method,
      receivedOn,
      reference: reference || undefined,
      notes: notes || undefined,
      clientRequestId: requestId,
    }).catch(() => ({ success: false as const, error: 'errors.generic' }));
    inFlight.current = false;
    setIsPending(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setDone(confirmsImmediately ? t('doneConfirmed', { amount: format.money(value) }) : t('donePending', { amount: format.money(value) }));
    setAmount('');
    setReference('');
    setNotes('');
    setRequestId(crypto.randomUUID());
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        {t('available', { name: driverName, amount: format.money(available) })}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-amount`}>{t('amount')}</Label>
          <Input
            id={`${ids}-amount`}
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            aria-required
            aria-invalid={error?.startsWith('operator.cash.validation.amount') || undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-method`}>{t('method')}</Label>
          <Select id={`${ids}-method`} value={method} onChange={(event) => setMethod(event.target.value as RemittanceMethod)}>
            {REMITTANCE_METHODS.map((option) => (
              <option key={option} value={option}>
                {tMethod(option)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-date`}>{t('receivedOn')}</Label>
          <Input
            id={`${ids}-date`}
            type="date"
            max={today}
            value={receivedOn}
            onChange={(event) => setReceivedOn(event.target.value)}
            aria-required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-reference`}>{t('reference')}</Label>
          <Input
            id={`${ids}-reference`}
            value={reference}
            maxLength={100}
            onChange={(event) => setReference(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`${ids}-notes`}>{t('notes')}</Label>
          <textarea
            id={`${ids}-notes`}
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{confirmsImmediately ? t('managerHint') : t('operatorHint')}</p>
      <FieldError message={error} />
      {done ? (
        <p className="text-sm font-medium text-primary" role="status">
          {done}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isPending || available <= 0}>
          {isPending ? t('saving') : t('submit')}
        </Button>
      </div>
    </form>
  );
};

export default RecordRemittanceForm;
