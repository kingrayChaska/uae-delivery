'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import ConfirmButton from '@/components/ui/confirm-button';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import { correctShipmentStatusAction } from '@/lib/dispatch/actions';

import type { ShipmentStatus } from '@/lib/types';

type CorrectStatusButtonProps = {
  shipmentId: string;
  // What the operator is looking at: the server refuses the correction if
  // the shipment has moved on since this page was loaded.
  currentStatus: ShipmentStatus;
  // From correctionTargets(): only moves the database accepts.
  targets: ShipmentStatus[];
};

const CorrectStatusButton = ({ shipmentId, currentStatus, targets }: CorrectStatusButtonProps) => {
  const t = useTranslations('operator.shipmentDetail');
  const tStatus = useTranslations('shipments.status');
  const router = useRouter();
  const statusId = useId();
  const reasonId = useId();
  const [newStatus, setNewStatus] = useState<ShipmentStatus | ''>('');
  const [reason, setReason] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!newStatus) {
      setError('operator.validation.correctionStatus');
      return false;
    }
    if (reason.trim().length < 5) {
      setError('operator.validation.correctionReason');
      return false;
    }

    setIsPending(true);
    setError(null);
    const result = await correctShipmentStatusAction({
      shipmentId,
      expectedStatus: currentStatus,
      newStatus,
      reason,
    });
    setIsPending(false);

    if (!result.success) {
      setError(result.error);
      // A stale view: show what the shipment is now.
      router.refresh();
      return false;
    }

    setNewStatus('');
    setReason('');
    router.refresh();
    return true;
  };

  return (
    <ConfirmButton
      variant="outline"
      size="sm"
      title={t('correctTitle')}
      description={
        <div className="flex flex-col gap-3">
          <p>{t('correctDescription', { status: tStatus(currentStatus) })}</p>
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
                <option key={status} value={status}>
                  {tStatus(status)}
                </option>
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
