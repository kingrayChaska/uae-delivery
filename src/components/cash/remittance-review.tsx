'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
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
import { useFormat } from '@/i18n/hooks';
import { addAed, cashAmountSchema, toFils } from '@/lib/cash/remittances';
import {
  confirmDriverRemittanceAction,
  confirmOperatorRemittanceAction,
  disputeDriverRemittanceAction,
  disputeOperatorRemittanceAction,
} from '@/lib/cash/remittance-actions';

type RemittanceReviewProps = {
  // A driver's submission (an operator or manager counts it), or an
  // operator's (a manager counts it).
  kind: 'driver' | 'operator';
  remittanceId: string;
  number: string;
  fromName: string;
  codAmount: number;
  feeAmount: number;
};

const textareaClass =
  'w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm';

// Confirm receipt (what was physically counted, per category) or dispute.
// Counting less than submitted never edits the submission: the database
// closes it as disputed and records the counted cash on its own.
const RemittanceReview = ({ kind, remittanceId, number, fromName, codAmount, feeAmount }: RemittanceReviewProps) => {
  const t = useTranslations('cash.review');
  const format = useFormat();
  const router = useRouter();
  const toast = useToast();
  const codId = useId();
  const feeId = useId();
  const noteId = useId();
  const reasonId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [cod, setCod] = useState('');
  const [fee, setFee] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<'confirm' | 'dispute' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const submitted = addAed(codAmount, feeAmount);
  const parsedCod = cashAmountSchema.safeParse(cod);
  const parsedFee = cashAmountSchema.safeParse(fee);
  const counted = parsedCod.success && parsedFee.success ? addAed(parsedCod.data, parsedFee.data) : null;
  const differs =
    parsedCod.success && parsedFee.success && (toFils(parsedCod.data) !== toFils(codAmount) || toFils(parsedFee.data) !== toFils(feeAmount));

  const openConfirm = (next: boolean) => {
    if (pending) return;
    setConfirmOpen(next);
    if (next) {
      setCod(codAmount.toFixed(2));
      setFee(feeAmount.toFixed(2));
      setNote('');
      setError(null);
    }
  };

  const openDispute = (next: boolean) => {
    if (pending) return;
    setDisputeOpen(next);
    if (next) {
      setReason('');
      setError(null);
    }
  };

  const confirm = async () => {
    if (inFlight.current) return;
    if (!parsedCod.success || !parsedFee.success) {
      setError('cash.validation.amount');
      return;
    }
    if (toFils(parsedCod.data) > toFils(codAmount) || toFils(parsedFee.data) > toFils(feeAmount)) {
      setError('cash.validation.moreThanSubmitted');
      return;
    }
    if (differs && note.trim().length < 5) {
      setError('cash.validation.discrepancyReason');
      return;
    }
    inFlight.current = true;
    setPending('confirm');
    setError(null);
    const action = kind === 'driver' ? confirmDriverRemittanceAction : confirmOperatorRemittanceAction;
    const result = await action({ remittanceId, receivedCod: cod, receivedFee: fee, note: note || undefined }).catch(() => ({
      success: false as const,
      error: 'errors.generic',
    }));
    inFlight.current = false;
    setPending(null);
    if (!result.success) {
      setError(result.error);
      router.refresh();
      return;
    }
    setConfirmOpen(false);
    toast.show({
      type: 'success',
      message:
        result.data.status === 'discrepancy'
          ? t('recordedDiscrepancy', { number, amount: format.money(result.data.confirmedAmount) })
          : t('confirmed', { number, amount: format.money(result.data.confirmedAmount) }),
    });
    router.refresh();
  };

  const dispute = async () => {
    if (inFlight.current) return;
    if (reason.trim().length < 5) {
      setError('cash.validation.disputeReason');
      return;
    }
    inFlight.current = true;
    setPending('dispute');
    setError(null);
    const action = kind === 'driver' ? disputeDriverRemittanceAction : disputeOperatorRemittanceAction;
    const result = await action({ remittanceId, reason }).catch(() => ({ success: false as const, error: 'errors.generic' }));
    inFlight.current = false;
    setPending(null);
    if (!result.success) {
      setError(result.error);
      router.refresh();
      return;
    }
    setDisputeOpen(false);
    toast.show({ type: 'success', message: t('disputed', { number }) });
    router.refresh();
  };

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Dialog open={confirmOpen} onOpenChange={openConfirm}>
        <DialogTrigger asChild>
          <Button type="button" size="sm">
            {t('confirmButton')}
            <span className="sr-only"> — {number}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('confirmTitle', { number })}</DialogTitle>
            <DialogDescription>{t('confirmDescription', { name: fromName, amount: format.money(submitted) })}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border p-3 font-brand-mono text-sm">
              <dt className="font-sans text-muted-foreground">{t('submittedCod')}</dt>
              <dd className="text-end">{format.money(codAmount)}</dd>
              <dt className="font-sans text-muted-foreground">{t('submittedFee')}</dt>
              <dd className="text-end">{format.money(feeAmount)}</dd>
              <dt className="border-t pt-1 font-sans font-semibold">{t('submittedTotal')}</dt>
              <dd className="border-t pt-1 text-end font-semibold">{format.money(submitted)}</dd>
            </dl>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={codId}>{t('countedCod')}</Label>
                <Input id={codId} inputMode="decimal" dir="ltr" autoComplete="off" className="font-brand-mono" value={cod} onChange={(event) => setCod(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={feeId}>{t('countedFee')}</Label>
                <Input id={feeId} inputMode="decimal" dir="ltr" autoComplete="off" className="font-brand-mono" value={fee} onChange={(event) => setFee(event.target.value)} />
              </div>
            </div>
            {differs && counted !== null ? (
              <p className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="status">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <span>{t('discrepancy', { counted: format.money(counted), submitted: format.money(submitted) })}</span>
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={noteId}>{differs ? t('discrepancyNote') : t('note')}</Label>
              <textarea id={noteId} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} aria-required={differs} className={textareaClass} />
            </div>
            <p className="text-xs text-muted-foreground">{t('audit')}</p>
            <FieldError message={confirmOpen ? error : null} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending !== null}>
                  {t('back')}
                </Button>
              </DialogClose>
              <Button type="submit" loading={pending === 'confirm'}>
                {differs ? t('confirmCounted', { amount: counted === null ? '—' : format.money(counted) }) : t('confirmAll', { amount: format.money(submitted) })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={disputeOpen} onOpenChange={openDispute}>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="outline">
            {t('disputeButton')}
            <span className="sr-only"> — {number}</span>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('disputeTitle', { number })}</DialogTitle>
            <DialogDescription>{t('disputeDescription', { amount: format.money(submitted) })}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={reasonId}>{t('disputeReason')}</Label>
            <textarea id={reasonId} rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} aria-required className={textareaClass} />
          </div>
          <FieldError message={disputeOpen ? error : null} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending !== null}>
                {t('back')}
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" loading={pending === 'dispute'} onClick={() => void dispute()}>
              {t('disputeConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RemittanceReview;
