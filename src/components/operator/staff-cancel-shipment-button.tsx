'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TriangleAlert, XCircle } from 'lucide-react';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
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
import { staffCancelShipmentAction } from '@/lib/dispatch/actions';

import type { Shipment } from '@/lib/types';
import type { StaffActionContext } from '@/lib/shipment/staff-actions';

type StaffCancelShipmentButtonProps = {
  shipment: Shipment;
  customerName: string | null;
  driverName: string | null;
  context: StaffActionContext;
};

const textareaClass =
  'w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm';

const destructiveOutline =
  'border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive';

// Cancels a shipment on operations' authority, after an explicit
// confirmation with a reason. staff_cancel_shipment() (0046) decides; this
// shows what will happen, including money that cancelling does NOT undo.
const StaffCancelShipmentButton = ({ shipment, customerName, driverName, context }: StaffCancelShipmentButtonProps) => {
  const t = useTranslations('operator.shipmentDetail.cancel');
  const tStatus = useTranslations('shipments.status');
  const router = useRouter();
  const toast = useToast();
  const format = useFormat();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const inFlight = useRef(false);

  const handleOpenChange = (next: boolean) => {
    if (isPending) return;
    setOpen(next);
    if (next) {
      setRequestId(crypto.randomUUID());
      setReason('');
      setError(null);
    }
  };

  const handleConfirm = async () => {
    if (inFlight.current) return;
    if (reason.trim().length < 5) {
      setError('operator.validation.cancelReason');
      return;
    }

    inFlight.current = true;
    setIsPending(true);
    setError(null);
    const result = await staffCancelShipmentAction({
      shipmentId: shipment.id,
      expectedStatus: shipment.status,
      reason,
      requestId,
    });
    inFlight.current = false;
    setIsPending(false);

    if (!result.success) {
      setError(result.error);
      router.refresh();
      return;
    }

    setOpen(false);
    toast.show({
      type: 'success',
      message: result.data.refundRequired ? t('cancelledRefund') : t('cancelled'),
    });
    router.refresh();
  };

  const trigger = (
    <DialogTrigger asChild>
      <Button type="button" variant="outline" size="sm" className={destructiveOutline}>
        <XCircle aria-hidden />
        {t('button')}
      </Button>
    </DialogTrigger>
  );

  // Picked up: the parcel is with the driver, so it goes back to the sender
  // rather than being cancelled.
  if (context.cancelBlock) {
    return (
      <Dialog>
        {trigger}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('blockedTitle')}</DialogTitle>
            <DialogDescription>{t(`blocked.${context.cancelBlock}`)}</DialogDescription>
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
      {trigger}
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleConfirm();
          }}
          noValidate
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-3 text-sm">
            <dt className="text-muted-foreground">{t('shipment')}</dt>
            <dd dir="ltr" className="text-end font-brand-mono">
              {shipment.trackingNumber}
            </dd>
            <dt className="text-muted-foreground">{t('customer')}</dt>
            <dd className="wrap-break-word text-end">{customerName ?? shipment.guestCustomer?.name ?? '—'}</dd>
            <dt className="text-muted-foreground">{t('recipient')}</dt>
            <dd className="wrap-break-word text-end">{shipment.dropoff.contactName}</dd>
            <dt className="text-muted-foreground">{t('status')}</dt>
            <dd className="text-end">{tStatus(shipment.status)}</dd>
            <dt className="text-muted-foreground">{t('driver')}</dt>
            <dd className="wrap-break-word text-end">{driverName ?? t('noDriver')}</dd>
          </dl>

          <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <ul className="flex list-disc flex-col gap-1 ps-4">
              <li>{t('consequences.final')}</li>
              <li>{shipment.driverId ? t('consequences.driver') : t('consequences.noDriver')}</li>
              <li>{t('consequences.customer')}</li>
              {shipment.batchId ? <li>{t('consequences.bulk')}</li> : null}
              {context.feePaid ? <li className="font-medium">{t('money.feePaid')}</li> : null}
              {context.cashCollected > 0 ? (
                <li className="font-medium">
                  {t('money.cashCollected', { amount: format.money(context.cashCollected, shipment.currency) })}
                </li>
              ) : null}
              {context.cashExpected > 0 ? (
                <li>{t('money.cashExpected', { amount: format.money(context.cashExpected, shipment.currency) })}</li>
              ) : null}
              {context.invoiceNumber ? <li>{t('money.invoice', { number: context.invoiceNumber })}</li> : null}
            </ul>
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
                {t('keep')}
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" loading={isPending} loadingText={t('cancelling')}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default StaffCancelShipmentButton;
