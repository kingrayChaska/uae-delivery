'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
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
import { operatorChangeShipmentStatusAction } from '@/lib/dispatch/actions';
import { OPERATOR_STATUS_OPTIONS } from '@/lib/shipment/operator-status';

import type { StaffActionContext } from '@/lib/shipment/staff-actions';
import type { OperatorStatusOption } from '@/lib/shipment/operator-status';
import type { Shipment } from '@/lib/types';

type OperatorStatusChangeButtonProps = {
  shipment: Shipment;
  customerName: string | null;
  driverName: string | null;
  context: StaffActionContext | null;
};

const OperatorStatusChangeButton = ({
  shipment,
  customerName,
  driverName,
  context,
}: OperatorStatusChangeButtonProps) => {
  const t = useTranslations('operator.shipmentDetail.statusChange');
  const tCancel = useTranslations('operator.shipmentDetail.cancel');
  const tStatus = useTranslations('shipments.status');
  const router = useRouter();
  const toast = useToast();
  const format = useFormat();
  const statusId = useId();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<OperatorStatusOption | ''>('pending');
  const [reason, setReason] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const inFlight = useRef(false);

  const handleOpenChange = (next: boolean) => {
    if (isPending) return;
    setOpen(next);
    if (next) {
      setStatus('pending');
      setReason('');
      setError(null);
      setRequestId(crypto.randomUUID());
    }
  };

  const handleConfirm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || !status) return;

    if (status === 'cancel' && reason.trim().length < 5) {
      setError('operator.validation.cancelReason');
      return;
    }
    if (status === 'returned' && !reason.trim()) {
      setError('operator.validation.reason');
      return;
    }

    inFlight.current = true;
    setIsPending(true);
    setError(null);
    const result = await operatorChangeShipmentStatusAction({
      shipmentId: shipment.id,
      expectedStatus: shipment.status,
      status,
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
    if (result.data.unchanged) {
      toast.show({ type: 'success', message: t('alreadyPending') });
    } else if (status === 'cancel' && result.data.refundRequired) {
      toast.show({ type: 'success', message: tCancel('cancelledRefund') });
    } else {
      toast.show({ type: 'success', message: t(`success.${status}`) });
    }
    router.refresh();
  };

  const cancelBlock = context?.cancelBlock;
  const pendingAlready = shipment.status === 'confirmed' && shipment.driverId === null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={(event) => void handleConfirm(event)} noValidate>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-3 text-sm">
            <dt className="text-muted-foreground">{tCancel('shipment')}</dt>
            <dd dir="ltr" className="text-end font-brand-mono">{shipment.trackingNumber}</dd>
            <dt className="text-muted-foreground">{t('currentStatus')}</dt>
            <dd className="text-end">{tStatus(shipment.status)}</dd>
            <dt className="text-muted-foreground">{tCancel('customer')}</dt>
            <dd className="wrap-break-word text-end">{customerName ?? shipment.guestCustomer?.name ?? '—'}</dd>
            <dt className="text-muted-foreground">{tCancel('driver')}</dt>
            <dd className="wrap-break-word text-end">{driverName ?? tCancel('noDriver')}</dd>
          </dl>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={statusId}>{t('label')}</Label>
            <Select
              id={statusId}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as OperatorStatusOption | '');
                setReason('');
                setError(null);
              }}
              required
              aria-required
              disabled={isPending}
            >
              {OPERATOR_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`options.${option}`)}
                </option>
              ))}
            </Select>
          </div>

          {status === 'pending' ? (
            <p className="rounded-lg border bg-secondary/50 p-3 text-sm">
              {shipment.status === 'pending_payment'
                && shipment.paymentMethod === 'card'
                ? t('pendingCash')
                : pendingAlready
                  ? t('pendingAlreadyDescription')
                  : t('pendingUnavailable')}
            </p>
          ) : null}

          {status === 'delivered' ? (
            <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
              {t('deliveredRequiresDriver')}
            </p>
          ) : null}

          {status === 'returned' ? (
            <>
              <p className="rounded-lg border bg-secondary/50 p-3 text-sm">{t('returnedDescription')}</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={reasonId}>{t('returnReason')}</Label>
                <textarea
                  id={reasonId}
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-required
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
                  disabled={isPending}
                />
              </div>
            </>
          ) : null}

          {status === 'cancel' ? (
            <>
              {cancelBlock ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="status">
                  {tCancel(`blocked.${cancelBlock}`)}
                </p>
              ) : (
                <>
                  <ul className="flex list-disc flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 ps-7 text-sm">
                    <li>{tCancel('consequences.final')}</li>
                    <li>{shipment.driverId ? tCancel('consequences.driver') : tCancel('consequences.noDriver')}</li>
                    <li>{tCancel('consequences.customer')}</li>
                    {shipment.batchId ? <li>{tCancel('consequences.bulk')}</li> : null}
                    {context?.feePaid ? <li>{tCancel('money.feePaid')}</li> : null}
                    {context && context.cashCollected > 0 ? (
                      <li>{tCancel('money.cashCollected', { amount: format.money(context.cashCollected, shipment.currency) })}</li>
                    ) : null}
                    {context && context.cashExpected > 0 ? (
                      <li>{tCancel('money.cashExpected', { amount: format.money(context.cashExpected, shipment.currency) })}</li>
                    ) : null}
                    {context?.invoiceNumber ? (
                      <li>{tCancel('money.invoice', { number: context.invoiceNumber })}</li>
                    ) : null}
                  </ul>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={reasonId}>{tCancel('reason')}</Label>
                    <textarea
                      id={reasonId}
                      rows={3}
                      maxLength={500}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={tCancel('reasonPlaceholder')}
                      aria-required
                      className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
                      disabled={isPending}
                    />
                    <p className="text-xs text-muted-foreground">{tCancel('audit')}</p>
                  </div>
                </>
              )}
            </>
          ) : null}

          <FieldError message={error} />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t('close')}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={status === 'cancel' ? 'destructive' : 'default'}
              loading={isPending}
              loadingText={t('applying')}
              disabled={!status || isPending || Boolean(cancelBlock)}
            >
              {status ? t(`confirm.${status}`) : t('confirm.choose')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default OperatorStatusChangeButton;
