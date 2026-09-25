'use client';

import { useState } from 'react';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
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

const navigationUrl = (coordinates: Coordinates) =>
  `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lng}`;

type ShipmentWorkflowProps = {
  shipmentId: string;
  status: ShipmentStatus;
  pickup: Coordinates;
  dropoff: Coordinates;
};

const ShipmentWorkflow = ({ shipmentId, status, pickup, dropoff }: ShipmentWorkflowProps) => {
  const { isPending, error, accept, decline, advance, reportFailed } = useShipmentWorkflowActions(shipmentId);
  const [showFailureForm, setShowFailureForm] = useState(false);
  const [failureReason, setFailureReason] = useState('');

  useDriverLocationTracking(shipmentId, TRACKING_STATUSES.includes(status));

  const failureForm = FAILURE_ELIGIBLE_STATUSES.includes(status) ? (
    <div className="flex flex-col gap-2">
      {showFailureForm ? (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3">
          <Input
            placeholder="Reason the delivery failed"
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
              Confirm Failed Delivery
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowFailureForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="self-start text-sm text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setShowFailureForm(true)}
        >
          Report failed delivery
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {error ? <FieldError message={error} /> : null}

      {status === 'assigned' ? (
        <div className="flex gap-2">
          <Button type="button" disabled={isPending} onClick={accept}>
            Accept Delivery
          </Button>
          <Button type="button" variant="outline" disabled={isPending} onClick={decline}>
            Decline
          </Button>
        </div>
      ) : null}

      {status === 'driver_accepted' ? (
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline">
            <a href={navigationUrl(pickup)} target="_blank" rel="noreferrer">
              Navigate to Pickup
            </a>
          </Button>
          <Button type="button" disabled={isPending} onClick={() => advance('arrived_pickup')}>
            Arrived at Pickup
          </Button>
        </div>
      ) : null}

      {status === 'arrived_pickup' ? (
        <div className="flex flex-col gap-2">
          <VerifyPickupQr shipmentId={shipmentId} />
          <Button type="button" disabled={isPending} onClick={() => advance('picked_up')}>
            Confirm Pickup
          </Button>
          {failureForm}
        </div>
      ) : null}

      {status === 'picked_up' ? (
        <Button type="button" disabled={isPending} onClick={() => advance('in_transit')}>
          Start Delivery
        </Button>
      ) : null}

      {status === 'in_transit' ? (
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline">
            <a href={navigationUrl(dropoff)} target="_blank" rel="noreferrer">
              Navigate to Customer
            </a>
          </Button>
          <Button type="button" disabled={isPending} onClick={() => advance('arrived_destination')}>
            Arrived
          </Button>
          {failureForm}
        </div>
      ) : null}

      {status === 'arrived_destination' ? (
        <div className="flex flex-col gap-3">
          <ProofOfDeliveryForm shipmentId={shipmentId} />
          {failureForm}
        </div>
      ) : null}
    </div>
  );
};

export default ShipmentWorkflow;
