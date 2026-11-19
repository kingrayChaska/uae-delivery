'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import ConfirmButton from '@/components/ui/confirm-button';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { correctShipmentStatusAction } from '@/lib/dispatch/actions';
import { OPERATOR_CORRECTION_OPTIONS } from '@/lib/shipment/status-corrections';

import type { ShipmentStatus } from '@/lib/types';

type CorrectStatusButtonProps = {
  shipmentId: string;
  trackingNumber: string;
  // What the operator is looking at: the server refuses the correction if
  // the shipment has moved on since this page was loaded.
  currentStatus: ShipmentStatus;
  isOperator: boolean;
  targets: ShipmentStatus[];
};

const CorrectStatusButton = ({ shipmentId, trackingNumber, currentStatus, isOperator, targets }: CorrectStatusButtonProps) => {
  const t = useTranslations('operator.shipmentDetail');
  const tStatus = useTranslations('shipments.status');
  const router = useRouter();
  const toast = useToast();
  const statusId = useId();
  const reasonId = useId();
  const inFlight = useRef(false);
  const [newStatus, setNewStatus] = useState<ShipmentStatus | ''>('');
  const [reason, setReason] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = (status: ShipmentStatus) => {
    const option = OPERATOR_CORRECTION_OPTIONS.find((item) => item.status === status);
    return isOperator && option ? t(`correctOptions.${option.label}`) : tStatus(status);
  };

  const handleConfirm = async () => {
    if (inFlight.current) return false;
    if (!newStatus) {
      setError('operator.validation.correctionStatus');
      return false;
    }
    if (reason.trim().length < 5) {
      setError('operator.validation.correctionReason');
      return false;
    }

    inFlight.current = true;
    setIsPending(true);
    setError(null);
    try {
      const result = await correctShipmentStatusAction({
        shipmentId,
        expectedStatus: currentStatus,
        newStatus,
        reason,
      });

      if (!result.success) {
        setError(result.error);
        router.refresh();
        return false;
      }

      toast.show({
        type: 'success',
        message: t('correctSuccess', { status: statusLabel(newStatus) }),
      });
      setNewStatus('');
      setReason('');
      router.refresh();
      return true;
    } finally {
      inFlight.current = false;
      setIsPending(false);
    }
  };

  return (
    <ConfirmButton
      variant="outline"
      size="sm"
      title={t('correctTitle')}
      description={
        <div className="flex flex-col gap-3">
          <p>{t('correctShipmentId', { id: trackingNumber })}</p>
          <p>{t('correctDescription', { status: isOperator ? statusLabel(currentStatus) : tStatus(currentStatus) })}</p>
          {isOperator ? <p>{t('correctAdminOverride')}</p> : null}
          <div className="flex flex-col gap-1.5 text-foreground">
            <Label htmlFor={statusId}>{t('correctTo')}</Label>
            <Select
              id={statusId}
              value={newStatus}
              onChange={(event) => setNewStatus(event.target.value as ShipmentStatus | '')}
              aria-required
            >
              <option value="">{t('correctChoose')}</option>
              {targets.map((status) => (
                <option key={status} value={status}>{statusLabel(status)}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 text-foreground">
            <Label htmlFor={reasonId}>{t('correctReason')}</Label>
            <textarea
              id={reasonId}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('correctReasonPlaceholder')}
              aria-required
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
            />
          </div>
          <p className="text-xs">{t('correctAudit')}</p>
        </div>
      }
      confirmLabel={t('correctConfirm')}
      isPending={isPending}
      error={error}
      onConfirm={handleConfirm}
    >
      {isPending ? t('correcting') : t('correct')}
    </ConfirmButton>
  );
};

export default CorrectStatusButton;
