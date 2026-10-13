'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
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
import { recordSettlementAction, voidSettlementAction } from '@/lib/finance/actions';
import { SETTLEMENT_METHODS, balanceLabel } from '@/lib/finance/statements';
import { useFormat } from '@/i18n/hooks';

import type { Settlement, SettlementMethod, StatementBalance } from '@/lib/finance/statements';

type StatementSettlementPanelProps = {
  statementId: string;
  // Only the current published statement takes payments.
  canRecord: boolean;
  balance: StatementBalance;
  settlements: Settlement[];
  currency: string;
  today: string;
};

const textareaClass =
  'w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm';

const VoidSettlement = ({ settlementId }: { settlementId: string }) => {
  const t = useTranslations('finance.statements.settlement');
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => (isPending ? null : setOpen(next))}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive">
          {t('void')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setIsPending(true);
            setError(null);
            const result = await voidSettlementAction({ settlementId, reason }).catch(() => ({ success: false as const, error: 'errors.generic' }));
            setIsPending(false);
            if (!result.success) {
              setError(result.error);
              return;
            }
            setOpen(false);
            router.refresh();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('voidTitle')}</DialogTitle>
            <DialogDescription>{t('voidDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-reason`}>{t('voidReason')}</Label>
            <textarea id={`${ids}-reason`} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={textareaClass} />
          </div>
          <FieldError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={isPending || reason.trim().length < 5}>
              {t('voidConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// A manager records the money that actually changed hands for a
// statement — ParcelLink paying out a remittance, or the merchant paying
// what they owe. The database decides the direction from the balance and
// refuses more than is outstanding (migration 0045).
const StatementSettlementPanel = ({ statementId, canRecord, balance, settlements, currency, today }: StatementSettlementPanelProps) => {
  const t = useTranslations('finance.statements.settlement');
  const tMethod = useTranslations('finance.document.settlements.methods');
  const format = useFormat();
  const router = useRouter();
  const ids = useId();
  const outstanding = Math.abs(balance.balance);
  const label = balanceLabel(balance);
  const [amount, setAmount] = useState(outstanding ? outstanding.toFixed(2) : '');
  const [method, setMethod] = useState<SettlementMethod>('bank_transfer');
  const [paidOn, setPaidOn] = useState(today);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  // One id per submission, reused on a retry: the payment is recorded once.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const inFlight = useRef(false);
  const live = settlements.filter((s) => s.status === 'recorded');

  return (
    <section aria-labelledby={`${ids}-heading`} className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-6 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${ids}-heading`} className="text-lg font-medium">
            {t('heading')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <p className="text-sm font-semibold" role="status">
          {label === 'settled' ? t('settled') : t(label, { amount: format.money(outstanding, currency) })}
        </p>
      </div>

      {live.length ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {live.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                {format.calendarDate(s.paidOn)} · {t(s.direction)} · {tMethod(s.method)}
                {s.reference ? ` · ${s.reference}` : ''}
              </span>
              <span className="flex items-center gap-2">
                <span dir="ltr" className="font-brand-mono">
                  {format.money(s.amount, currency)}
                </span>
                <VoidSettlement settlementId={s.id} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {canRecord && label !== 'settled' ? (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (inFlight.current) return;
            const value = Number(amount.replace(/,/g, '').trim());
            if (!Number.isFinite(value) || value <= 0) {
              setError('finance.validation.amount');
              return;
            }
            if (value > outstanding) {
              setError('finance.validation.moreThanOutstanding');
              return;
            }
            inFlight.current = true;
            setIsPending(true);
            setError(null);
            const result = await recordSettlementAction({
              statementId,
              amount: value,
              method,
              paidOn,
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
            setRequestId(crypto.randomUUID());
            setReference('');
            setNotes('');
            router.refresh();
          }}
        >
          <p className="text-sm font-medium">{t(label === 'owedToMerchant' ? 'recordPayout' : 'recordReceipt')}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-amount`}>{t('amount')}</Label>
              <Input id={`${ids}-amount`} inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-method`}>{t('method')}</Label>
              <Select id={`${ids}-method`} value={method} onChange={(e) => setMethod(e.target.value as SettlementMethod)}>
                {SETTLEMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {tMethod(m)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-paid-on`}>{t('paidOn')}</Label>
              <Input id={`${ids}-paid-on`} type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-reference`}>{t('reference')}</Label>
              <Input id={`${ids}-reference`} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
              <Label htmlFor={`${ids}-notes`}>{t('notes')}</Label>
              <textarea id={`${ids}-notes`} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaClass} />
            </div>
          </div>
          <FieldError message={error} />
          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? t('saving') : t('submit')}
            </Button>
          </div>
        </form>
      ) : !canRecord ? (
        <p className="text-sm text-muted-foreground">{t('onlyCurrent')}</p>
      ) : null}
    </section>
  );
};

export default StatementSettlementPanel;
