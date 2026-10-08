'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
import DriverOutcomeButton from '@/components/driver/driver-outcome-button';
import { useShipmentWorkflowActions } from '@/lib/hooks/use-shipment-workflow-actions';
import { cn } from '@/lib/utils';

import type { ShipmentStatus } from '@/lib/types';

type StatusChoice = 'pending' | 'cancelled' | 'in_transit' | 'returned' | 'delivered';

// Where each choice can be made from. These mirror what the database
// accepts (shipment_status_transitions, driver_cancel_shipment /
// driver_return_shipment, complete_delivery) — it re-checks every one.
// "Pending" is a failed attempt (delivery_failed): dispatch reassigns it.
const AVAILABLE_FROM: Record<StatusChoice, ShipmentStatus[]> = {
  pending: ['arrived_pickup', 'in_transit', 'arrived_destination'],
  cancelled: ['driver_accepted', 'arrived_pickup'],
  in_transit: ['picked_up'],
  returned: ['picked_up', 'in_transit', 'arrived_destination'],
  delivered: ['in_transit', 'arrived_destination'],
};

const CHOICES = Object.keys(AVAILABLE_FROM) as StatusChoice[];

export const hasStatusUpdates = (status: ShipmentStatus) =>
  CHOICES.some((choice) => AVAILABLE_FROM[choice].includes(status));

// The proof-of-delivery form's anchor in ShipmentWorkflow.
export const PROOF_OF_DELIVERY_ANCHOR = 'proof-of-delivery';

// "Update Status": the driver picks what happened to the shipment, then
// confirms it. Each choice keeps its own rules — a reason for a failed
// attempt, the cancel / return confirmation, proof for a delivery.
const UpdateStatusPanel = ({ shipmentId, status }: { shipmentId: string; status: ShipmentStatus }) => {
  const t = useTranslations('driver.updateStatus');
  const tCommon = useTranslations('common.actions');
  const { isPending, error, advance, reportFailed } = useShipmentWorkflowActions(shipmentId);
  const groupId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [choice, setChoice] = useState<StatusChoice | null>(null);
  const [reason, setReason] = useState('');

  const close = () => {
    setIsOpen(false);
    setChoice(null);
    setReason('');
  };

  const closeOnSuccess = (succeeded: boolean) => {
    if (succeeded) close();
  };

  if (!isOpen) {
    return (
      <Button type="button" variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
        <RefreshCw aria-hidden />
        {t('button')}
      </Button>
    );
  }

  const goToProofOfDelivery = () => {
    close();
    document.getElementById(PROOF_OF_DELIVERY_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const confirmation =
    choice === 'pending' ? (
      <div className="flex flex-col gap-2">
        <Input
          placeholder={t('pendingReason')}
          aria-label={t('pendingReason')}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          className="border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={isPending || !reason.trim()}
          onClick={async () => closeOnSuccess(await reportFailed(reason.trim()))}
        >
          {t('confirmPending')}
        </Button>
      </div>
    ) : choice === 'cancelled' ? (
      <DriverOutcomeButton shipmentId={shipmentId} outcome="cancel" />
    ) : choice === 'returned' ? (
      <DriverOutcomeButton shipmentId={shipmentId} outcome="return" />
    ) : choice === 'in_transit' ? (
      <Button
        type="button"
        disabled={isPending}
        onClick={async () => closeOnSuccess(await advance('in_transit'))}
      >
        {t('confirmInTransit')}
      </Button>
    ) : choice === 'delivered' ? (
      status === 'arrived_destination' ? (
        <Button type="button" onClick={goToProofOfDelivery}>
          {t('goToProof')}
        </Button>
      ) : (
        <Button
          type="button"
          disabled={isPending}
          onClick={async () => closeOnSuccess(await advance('arrived_destination'))}
        >
          {t('arrivedForProof')}
        </Button>
      )
    ) : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <p id={groupId} className="text-sm font-medium">
        {t('title')}
      </p>

      <div role="radiogroup" aria-labelledby={groupId} className="flex flex-col gap-2">
        {CHOICES.map((option) => {
          const isAvailable = AVAILABLE_FROM[option].includes(status);
          const isSelected = choice === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={!isAvailable || isPending}
              onClick={() => setChoice(option)}
              className={cn(
                'flex min-h-11 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-start transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                isSelected ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
              )}
            >
              <span className="text-sm font-medium">{t(`options.${option}.label`)}</span>
              <span className="text-xs text-muted-foreground">
                {isAvailable ? t(`options.${option}.hint`) : t(`options.${option}.unavailable`)}
              </span>
            </button>
          );
        })}
      </div>

      {confirmation}
      <FieldError message={error} />

      <Button type="button" variant="ghost" size="sm" className="self-start" disabled={isPending} onClick={close}>
        {tCommon('cancel')}
      </Button>
    </div>
  );
};

export default UpdateStatusPanel;
