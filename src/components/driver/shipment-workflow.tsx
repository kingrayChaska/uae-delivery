'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
import DriverOutcomeButton from '@/components/driver/driver-outcome-button';
import ProofOfDeliveryForm from '@/components/driver/proof-of-delivery-form';
import VerifyPickupQr from '@/components/driver/verify-pickup-qr';
import { useShipmentWorkflowActions } from '@/lib/hooks/use-shipment-workflow-actions';
import { useDriverLocationTracking } from '@/lib/hooks/use-driver-location-tracking';

import type { Coordinates, ShipmentStatus } from '@/lib/types';

const TRACKING_STATUSES: ShipmentStatus[] = [
  'driver_accepted',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
];

const FAILURE_ELIGIBLE_STATUSES: ShipmentStatus[] = ['arrived_pickup', 'in_transit', 'arrived_destination'];

// Mirrors driver_cancel_shipment / driver_return_shipment (migration 0028):
// a parcel that hasn't been collected can be cancelled; once it's in the
// driver's hands it can only go back to the sender.
const CANCEL_ELIGIBLE_STATUSES: ShipmentStatus[] = ['driver_accepted', 'arrived_pickup'];
const RETURN_ELIGIBLE_STATUSES: ShipmentStatus[] = ['picked_up', 'in_transit', 'arrived_destination'];

const navigationUrl = (coordinates: Coordinates) =>
  `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lng}`;

type ShipmentWorkflowProps = {
  shipmentId: string;
  status: ShipmentStatus;
  pickup: Coordinates;
  dropoff: Coordinates;
  // What the recipient pays at the door (lib/shipment/collection.ts).
  codToCollect: number;
  currency: string;
};

const ShipmentWorkflow = ({ shipmentId, status, pickup, dropoff, codToCollect, currency }: ShipmentWorkflowProps) => {
  const t = useTranslations('driver.workflow');
  const tCommon = useTranslations('common.actions');
  const { isPending, error, accept, decline, advance, reportFailed } = useShipmentWorkflowActions(shipmentId);
  const [showFailureForm, setShowFailureForm] = useState(false);
  const [failureReason, setFailureReason] = useState('');

  useDriverLocationTracking(shipmentId, TRACKING_STATUSES.includes(status));

  const failureForm = FAILURE_ELIGIBLE_STATUSES.includes(status) ? (
    <div className="flex flex-col gap-2">
      {showFailureForm ? (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3">
          <Input
            placeholder={t('failureReason')}
            aria-label={t('failureReason')}
            value={failureReason}
            onChange={(event) => setFailureReason(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              disabled={isPending || !failureReason}
              onClick={() => reportFailed(failureReason)}
            >
              {t('confirmFailed')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowFailureForm(false)}>
              {tCommon('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="self-start text-sm text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setShowFailureForm(true)}
        >
          {t('reportFailed')}
        </button>
      )}
    </div>
  ) : null;

  const outcomeAction = CANCEL_ELIGIBLE_STATUSES.includes(status) ? (
    <DriverOutcomeButton shipmentId={shipmentId} outcome="cancel" />
  ) : RETURN_ELIGIBLE_STATUSES.includes(status) ? (
    <DriverOutcomeButton shipmentId={shipmentId} outcome="return" />
  ) : null;

  // Secondary exits from the happy path, kept below the main action.
  const exceptions =
    outcomeAction || failureForm ? (
      <div className="flex flex-col gap-3 border-t pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('problem')}</p>
        {outcomeAction}
        {failureForm}
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      {error ? <FieldError message={error} /> : null}

      {status === 'assigned' ? (
        <div className="flex gap-2">
          <Button type="button" disabled={isPending} onClick={accept}>
            {t('accept')}
          </Button>
          <Button type="button" variant="outline" disabled={isPending} onClick={decline}>
            {t('decline')}
          </Button>
        </div>
      ) : null}

      {status === 'driver_accepted' ? (
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline">
            <a href={navigationUrl(pickup)} target="_blank" rel="noreferrer">
              {t('navigatePickup')}
            </a>
          </Button>
          <Button type="button" disabled={isPending} onClick={() => advance('arrived_pickup')}>
            {t('arrivedPickup')}
          </Button>
        </div>
      ) : null}

      {status === 'arrived_pickup' ? (
        <div className="flex flex-col gap-2">
          <VerifyPickupQr shipmentId={shipmentId} />
          <Button type="button" disabled={isPending} onClick={() => advance('picked_up')}>
            {t('confirmPickup')}
          </Button>
        </div>
      ) : null}

      {status === 'picked_up' ? (
        <Button type="button" disabled={isPending} onClick={() => advance('in_transit')}>
          {t('start')}
        </Button>
      ) : null}

      {status === 'in_transit' ? (
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline">
            <a href={navigationUrl(dropoff)} target="_blank" rel="noreferrer">
              {t('navigateCustomer')}
            </a>
          </Button>
          <Button type="button" disabled={isPending} onClick={() => advance('arrived_destination')}>
            {t('arrived')}
          </Button>
        </div>
      ) : null}

      {status === 'arrived_destination' ? (
        <ProofOfDeliveryForm shipmentId={shipmentId} codToCollect={codToCollect} currency={currency} />
      ) : null}

      {exceptions}
    </div>
  );
};

export default ShipmentWorkflow;
