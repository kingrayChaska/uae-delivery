'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';

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
import { submitDriverRemittanceAction, submitOperatorRemittanceAction } from '@/lib/cash/remittance-actions';

type RemittanceSubmitFormProps = {
  // Driver → operator, or operator → manager.
  kind: 'driver' | 'operator';
  // What may be submitted now, per category (held, less pending), from the
  // database. The database checks it again.
  availableCod: number;
  availableFee: number;
};

const textareaClass =
  'w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm';

// Submits cash for the next person up to count. Submitting reserves the
// amount; only their confirmation takes it off the balance.
const RemittanceSubmitForm = ({ kind, availableCod, availableFee }: RemittanceSubmitFormProps) => {
  const t = useTranslations('cash.submit');
  const format = useFormat();
  const router = useRouter();
  const toast = useToast();
  const codId = useId();
  const feeId = useId();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [cod, setCod] = useState('');
  const [fee, setFee] = useState('');
  const [note, setNote] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const inFlight = useRef(false);

  const parsedCod = cashAmountSchema.safeParse(cod);
  const parsedFee = cashAmountSchema.safeParse(fee);
  const total = parsedCod.success && parsedFee.success ? addAed(parsedCod.data, parsedFee.data) : null;
  const available = addAed(availableCod, availableFee);
  const recipient = kind === 'driver' ? t('toOperator') : t('toManager');

  const handleOpenChange = (next: boolean) => {
    if (isPending) return;
    setOpen(next);
    if (next) {
      // Everything held is preselected; the person can lower either part.
      setRequestId(crypto.randomUUID());
      setCod(availableCod.toFixed(2));
      setFee(availableFee.toFixed(2));
      setNote('');
      setError(null);
    }
  };

  const validate = (): string | null => {
    if (!parsedCod.success || !parsedFee.success) return 'cash.validation.amount';
    if (toFils(parsedCod.data) > toFils(availableCod)) return 'cash.validation.moreCod';
    if (toFils(parsedFee.data) > toFils(availableFee)) return 'cash.validation.moreFee';
    if (toFils(parsedCod.data) + toFils(parsedFee.data) <= 0) return 'cash.validation.nothing';
    return null;
  };

  const handleSubmit = async () => {
    if (inFlight.current) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    inFlight.current = true;
    setIsPending(true);
    setError(null);
    const action = kind === 'driver' ? submitDriverRemittanceAction : submitOperatorRemittanceAction;
    const result = await action({ codAmount: cod, feeAmount: fee, note: note || undefined, requestId }).catch(() => ({
      success: false as const,
      error: 'errors.generic',
    }));
    inFlight.current = false;
    setIsPending(false);

    if (!result.success) {
      setError(result.error);
      router.refresh();
      return;
    }
    setOpen(false);
    toast.show({ type: 'success', message: t('submitted', { number: result.data.number, amount: format.money(result.data.amount) }) });
    router.refresh();
  };

  if (toFils(available) <= 0) {
    return <p className="text-sm text-muted-foreground">{t('nothingAvailable')}</p>;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" className="self-start">
          <Send aria-hidden />
          {kind === 'driver' ? t('buttonDriver') : t('buttonOperator')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind === 'driver' ? t('titleDriver') : t('titleOperator')}</DialogTitle>
          <DialogDescription>{t('description', { recipient })}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={codId}>{t('cod')}</Label>
              <Input id={codId} inputMode="decimal" dir="ltr" autoComplete="off" className="font-brand-mono" value={cod} onChange={(event) => setCod(event.target.value)} />
              <p className="text-xs text-muted-foreground">{t('available', { amount: format.money(availableCod) })}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={feeId}>{t('fee')}</Label>
              <Input id={feeId} inputMode="decimal" dir="ltr" autoComplete="off" className="font-brand-mono" value={fee} onChange={(event) => setFee(event.target.value)} />
              <p className="text-xs text-muted-foreground">{t('available', { amount: format.money(availableFee) })}</p>
            </div>
          </div>

          <dl aria-live="polite" className="flex justify-between gap-4 rounded-lg bg-secondary/60 p-3 font-brand-mono text-sm font-semibold">
            <dt className="font-sans">{t('total')}</dt>
            <dd>{total === null ? '—' : format.money(total)}</dd>
          </dl>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={noteId}>{t('note')}</Label>
            <textarea id={noteId} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className={textareaClass} />
          </div>

          <ul className="flex list-disc flex-col gap-1 ps-5 text-xs text-muted-foreground">
            <li>{t('reserves', { recipient })}</li>
            <li>{t('permanent')}</li>
          </ul>

          <FieldError message={error} />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" loading={isPending} loadingText={t('submitting')}>
              {t('confirm', { amount: total === null ? '—' : format.money(total) })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RemittanceSubmitForm;
