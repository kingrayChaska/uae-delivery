'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Pencil } from 'lucide-react';

import Badge from '@/components/ui/badge';
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
import { adjustShipmentPriceAction } from '@/lib/dispatch/actions';
import { MAX_SERVICE_CHARGE, newTotalFor, serviceChargeSchema, toFils } from '@/lib/shipment/staff-actions';

import type { AccountType, Shipment } from '@/lib/types';
import type { StaffActionContext } from '@/lib/shipment/staff-actions';

type EditPriceButtonProps = {
  shipment: Shipment;
  customerName: string | null;
  // null for a guest booking (no account).
  accountType: AccountType | null;
  context: StaffActionContext;
};

const textareaClass =
  'w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm';

// Changes a booked shipment's delivery service charge. Weight and
// cash-on-delivery handling charges, and the cash collected for the goods,
// are shown but never edited here. staff_adjust_shipment_price() (0046)
// re-checks everything this form checks.
const EditPriceButton = ({ shipment, customerName, accountType, context }: EditPriceButtonProps) => {
  const t = useTranslations('operator.shipmentDetail.editPrice');
  const tShipments = useTranslations('shipments');
  const router = useRouter();
  const toast = useToast();
  const format = useFormat();
  const amountId = useId();
  const reasonId = useId();
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  // A second click lands before React re-renders the disabled button.
  const inFlight = useRef(false);

  const money = (value: number) => format.money(value, shipment.currency);
  const parsedAmount = serviceChargeSchema.safeParse(amount);
  const newTotal = parsedAmount.success ? newTotalFor(shipment, parsedAmount.data) : null;
  const difference = newTotal === null ? null : (toFils(newTotal) - toFils(shipment.price)) / 100;
  const cashFee = shipment.paymentMethod === 'cod';
  const postpaid = shipment.recipientPaymentType === 'postpaid';

  const handleOpenChange = (next: boolean) => {
    if (isPending) return;
    setOpen(next);
    if (next) {
      // A fresh request per opening; a retry inside one opening reuses it, so
      // a timed-out request that did go through isn't applied twice.
      setRequestId(crypto.randomUUID());
      setAmount(context.serviceCharge.toFixed(2));
      setReason('');
      setError(null);
    }
  };

  const handleSave = async () => {
    if (inFlight.current) return;
    if (!parsedAmount.success) {
      setError(parsedAmount.error.issues[0]?.message ?? 'operator.validation.priceFormat');
      return;
    }
    if (difference === 0) {
      setError('operator.validation.priceUnchanged');
      return;
    }
    if (reason.trim().length < 5) {
      setError('operator.validation.priceReason');
      return;
    }

    inFlight.current = true;
    setIsPending(true);
    setError(null);
    const result = await adjustShipmentPriceAction({
      shipmentId: shipment.id,
      expectedStatus: shipment.status,
      expectedPrice: shipment.price,
      serviceCharge: amount,
      reason,
      requestId,
    });
    inFlight.current = false;
    setIsPending(false);

    if (!result.success) {
      setError(result.error);
      // A stale view: show what the shipment is now behind the dialog.
      router.refresh();
      return;
    }

    setOpen(false);
    toast.show({ type: 'success', message: t('saved', { price: money(result.data.price) }) });
    router.refresh();
  };

  // Money has already moved, or the shipment is on a statement: say why
  // instead of offering a form the server would refuse.
  if (context.priceEditBlock) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Pencil aria-hidden />
            {t('button')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('blockedTitle')}</DialogTitle>
            <DialogDescription>{t(`blocked.${context.priceEditBlock}`)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('close')}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil aria-hidden />
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
          noValidate
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-3 text-sm">
            <dt className="text-muted-foreground">{t('shipment')}</dt>
            <dd dir="ltr" className="text-end font-brand-mono">
              {shipment.trackingNumber}
            </dd>
            <dt className="text-muted-foreground">{t('customer')}</dt>
            <dd className="flex flex-wrap items-center justify-end gap-1.5 text-end">
              <span className="wrap-break-word">{customerName ?? shipment.guestCustomer?.name ?? '—'}</span>
              <Badge variant="secondary">{accountType ? t(`accountType.${accountType}`) : t('accountType.guest')}</Badge>
            </dd>
            <dt className="text-muted-foreground">{t('recipient')}</dt>
            <dd className="wrap-break-word text-end">{shipment.dropoff.contactName}</dd>
            <dt className="text-muted-foreground">{t('service')}</dt>
            <dd className="text-end">{tShipments(`deliveryType.${shipment.deliveryType}.label`)}</dd>
          </dl>

          <dl className="flex flex-col gap-1.5 font-brand-mono text-sm">
            <div className="flex justify-between gap-4">
              <dt className="font-sans text-muted-foreground">{t('serviceCharge')}</dt>
              <dd>{money(context.serviceCharge)}</dd>
            </div>
            {shipment.weightCharge ? (
              <div className="flex justify-between gap-4">
                <dt className="font-sans text-muted-foreground">{t('weightCharge')}</dt>
                <dd>{money(shipment.weightCharge)}</dd>
              </div>
            ) : null}
            {shipment.codCharge ? (
              <div className="flex justify-between gap-4">
                <dt className="font-sans text-muted-foreground">{t('codCharge')}</dt>
                <dd>{money(shipment.codCharge)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t pt-1.5 font-semibold">
              <dt className="font-sans">{t('currentPrice')}</dt>
              <dd>{money(shipment.price)}</dd>
            </div>
            {postpaid ? (
              <div className="flex justify-between gap-4 text-muted-foreground">
                <dt className="font-sans">{t('codAmount')}</dt>
                <dd>{money(shipment.codAmount)}</dd>
              </div>
            ) : null}
          </dl>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={amountId}>{t('newServiceCharge')}</Label>
            <Input
              id={amountId}
              inputMode="decimal"
              autoComplete="off"
              dir="ltr"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-describedby={hintId}
              aria-invalid={amount !== '' && !parsedAmount.success ? true : undefined}
              aria-required
              className="font-brand-mono"
            />
            <p id={hintId} className="text-xs text-muted-foreground">
              {t('hint', { max: money(MAX_SERVICE_CHARGE) })}
            </p>
          </div>

          <div aria-live="polite" className="rounded-lg bg-secondary/60 p-3 text-sm">
            {newTotal !== null && difference !== null ? (
              <div className="flex flex-col gap-2">
                <p className="flex flex-wrap items-center gap-2 font-brand-mono font-semibold">
                  <span>{money(shipment.price)}</span>
                  <ArrowRight className="size-4 rtl:rotate-180" aria-label={t('to')} />
                  <span>{money(newTotal)}</span>
                  <span className={difference < 0 ? 'text-destructive' : difference > 0 ? 'text-primary' : 'text-muted-foreground'}>
                    ({difference > 0 ? '+' : ''}
                    {money(difference)})
                  </span>
                </p>
                <ul className="flex list-disc flex-col gap-1 ps-5 text-muted-foreground">
                  <li>{t('impact.customer')}</li>
                  {cashFee ? <li>{t('impact.cashFee', { amount: money(newTotal) })}</li> : null}
                  {postpaid ? <li>{t('impact.codUnchanged', { amount: money(shipment.codAmount) })}</li> : null}
                  {context.invoiceNumber ? <li>{t('impact.invoice', { number: context.invoiceNumber })}</li> : null}
                  {shipment.batchId ? <li>{t('impact.bulk')}</li> : null}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">{t('enterAmount')}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={reasonId}>{t('reason')}</Label>
            <textarea
              id={reasonId}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reasonPlaceholder')}
              aria-required
              className={textareaClass}
            />
            <p className="text-xs text-muted-foreground">{t('audit')}</p>
          </div>

          <FieldError message={error} />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" loading={isPending} loadingText={t('saving')}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditPriceButton;
