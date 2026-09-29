import { notFound } from 'next/navigation';
import Link from 'next/link';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import AddressBlock from '@/components/shipment/address-block';
import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import RouteMap from '@/components/maps/lazy-route-map';
import MarkReturnedButton from '@/components/operator/mark-returned-button';
import ReassignDriverSection from '@/components/operator/reassign-driver-section';
import ShipmentChargesCard from '@/components/shipment/shipment-charges-card';
import ProofOfDeliveryButton from '@/components/shipment/proof-of-delivery';
import TrackingCode from '@/components/shipment/tracking-code';
import { getShipmentDetail } from '@/services/shipments/get-shipment';
import { getProofOfDelivery } from '@/services/shipments/get-proof-of-delivery';
import { getProfileName } from '@/services/profiles/get-profile-name';
import { formatEta, formatShipmentStatus } from '@/lib/shipment/format';

import type { StaffDetailViewProps } from '@/components/staff-views/types';

const ShipmentDetailView = async ({ basePath, id }: StaffDetailViewProps) => {

  const detail = await getShipmentDetail(id);
  if (!detail) notFound();

  const { shipment, history } = detail;
  const [driverName, proof] = await Promise.all([
    getProfileName(shipment.driverId),
    shipment.status === 'delivered' ? getProofOfDelivery(shipment.id) : Promise.resolve(null),
  ]);

  const canAssign = shipment.status === 'confirmed' && !shipment.driverId;
  const canReassign = shipment.status === 'assigned' || shipment.status === 'delivery_failed';

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <TrackingCode code={shipment.trackingNumber} />
          <h1 className="break-words text-xl font-semibold sm:text-2xl">
            {shipment.pickup.formattedAddress} → {shipment.dropoff.formattedAddress}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`${basePath}/shipments/${shipment.id}/label`}>View label</Link>
          </Button>
          <ShipmentStatusBadge status={shipment.status} />
          {shipment.status === 'delivery_failed' ? <MarkReturnedButton shipmentId={shipment.id} /> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Driver</span>
                <span>{driverName ?? 'Unassigned'}</span>
              </div>
              <AddressBlock heading="Pickup" address={shipment.pickup} />
              <AddressBlock heading="Delivery" address={shipment.dropoff} />
              <div className="grid grid-cols-2 gap-4 border-t pt-3 font-brand-mono">
                <div>
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <p>{shipment.distanceKm.toFixed(1)} km</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Est. drive time</p>
                  <p>{formatEta(shipment.durationMinutes)}</p>
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">Package</p>
                <p>
                  {shipment.packageQuantity} × {shipment.packageDescription}
                  {shipment.packageWeightKg ? ` · ${shipment.packageWeightKg} kg` : ''}
                  {shipment.isFragile ? ' · Fragile' : ''}
                </p>
              </div>
            </CardContent>
          </Card>

          {canAssign || canReassign ? (
            <Card>
              <CardContent className="pt-6">
                <p className="mb-3 text-sm font-medium">{canAssign ? 'Assign a driver' : 'Reassign driver'}</p>
                <ReassignDriverSection
                  shipmentId={shipment.id}
                  pickup={shipment.pickup.coordinates}
                  mode={canAssign ? 'assign' : 'reassign'}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="pt-6">
              <p className="mb-2 text-sm font-medium">Status history</p>
              <ul className="flex flex-col gap-1 text-sm">
                {history.map((entry) => (
                  <li key={`${entry.status}-${entry.createdAt}`} className="flex justify-between">
                    <span className="text-muted-foreground">{formatShipmentStatus(entry.status)}</span>
                    <span className="font-brand-mono">{new Date(entry.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <ShipmentChargesCard shipment={shipment} />
          {shipment.status === 'delivered' ? (
            <Card>
              <CardContent className="pt-6">
                <ProofOfDeliveryButton proof={proof} status={shipment.status} trackingCode={shipment.trackingNumber} />
              </CardContent>
            </Card>
          ) : null}
          <RouteMap
            pickup={shipment.pickup.coordinates}
            dropoff={shipment.dropoff.coordinates}
            className="h-80 w-full rounded-2xl"
          />
        </div>
      </div>
    </main>
  );
};

export default ShipmentDetailView;
