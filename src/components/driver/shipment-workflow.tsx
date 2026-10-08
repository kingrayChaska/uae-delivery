'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import ProofOfDeliveryForm from '@/components/driver/proof-of-delivery-form';
import UpdateStatusPanel, { PROOF_OF_DELIVERY_ANCHOR, hasStatusUpdates } from '@/components/driver/update-status-panel';
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
  const { isPending, error, accept, decline, advance } = useShipmentWorkflowActions(shipmentId);

  useDriverLocationTracking(shipmentId, TRACKING_STATUSES.includes(status));

  // Changing the status outside the next step (a failed attempt, cancel,
  // return…), kept below the main action.
  const statusUpdate = hasStatusUpdates(status) ? (
    <div className="border-t pt-3">
      <UpdateStatusPanel shipmentId={shipmentId} status={status} />
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
        <div id={PROOF_OF_DELIVERY_ANCHOR} className="scroll-mt-20">
          <ProofOfDeliveryForm shipmentId={shipmentId} codToCollect={codToCollect} currency={currency} />
        </div>
      ) : null}

      {statusUpdate}
    </div>
  );
};

export default ShipmentWorkflow;
