import { notFound } from 'next/navigation';
import Link from 'next/link';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import RouteMap from '@/components/maps/lazy-route-map';
import MarkReturnedButton from '@/components/operator/mark-returned-button';
import ReassignDriverSection from '@/components/operator/reassign-driver-section';
import { getShipmentDetail } from '@/services/shipments/get-shipment';
import { getProfileName } from '@/services/profiles/get-profile-name';
import { formatEta, formatShipmentStatus } from '@/lib/shipment/format';

import type { StaffDetailViewProps } from '@/components/staff-views/types';

const ShipmentDetailView = async ({ basePath, id }: StaffDetailViewProps) => {

  const detail = await getShipmentDetail(id);
  if (!detail) notFound();

  const { shipment, history } = detail;
  const driverName = await getProfileName(shipment.driverId);

  const canAssign = shipment.status === 'confirmed' && !shipment.driverId;
  const canReassign = shipment.status === 'assigned' || shipment.status === 'delivery_failed';

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-brand-mono text-sm text-muted-foreground">{shipment.trackingNumber}</p>
          <h1 className="text-2xl font-semibold">
            {shipment.pickup.formattedAddress} → {shipment.dropoff.formattedAddress}
          </h1>
        </div>
        <div className="flex items-center gap-3">
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
              <div>
                <p className="text-xs text-muted-foreground">Pickup</p>
                <p>{shipment.pickup.formattedAddress}</p>
                <p className="text-muted-foreground">
                  {shipment.pickup.contactName} · {shipment.pickup.contactPhone}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Delivery</p>
                <p>{shipment.dropoff.formattedAddress}</p>
                <p className="text-muted-foreground">
                  {shipment.dropoff.contactName} · {shipment.dropoff.contactPhone}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 border-t pt-3 font-brand-mono">
                <div>
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <p>{shipment.distanceKm.toFixed(1)} km</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ETA</p>
                  <p>{formatEta(shipment.durationMinutes)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p>
                    {shipment.currency} {shipment.price.toFixed(2)}
                  </p>
                </div>
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

        <RouteMap
          pickup={shipment.pickup.coordinates}
          dropoff={shipment.dropoff.coordinates}
          className="h-80 w-full rounded-md"
        />
      </div>
    </main>
  );
};

export default ShipmentDetailView;
