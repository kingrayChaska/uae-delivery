import { notFound } from 'next/navigation';

import { Card, CardContent } from '@/components/ui/card';
import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import ShipmentWorkflow from '@/components/driver/shipment-workflow';
import RouteMap from '@/components/maps/lazy-route-map';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getShipmentDetail } from '@/services/shipments/get-shipment';
import { formatEta } from '@/lib/shipment/format';

const TERMINAL_STATUSES = ['delivered', 'delivery_failed', 'cancelled', 'returned'];

const DriverDeliveryDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('driver');
  const { id } = await params;

  const detail = await getShipmentDetail(id);
  if (!detail) notFound();

  const { shipment, packageImageUrl } = detail;
  const isTerminal = TERMINAL_STATUSES.includes(shipment.status);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-brand-mono text-sm text-muted-foreground">{shipment.trackingNumber}</p>
          <h1 className="text-2xl font-semibold">
            {shipment.pickup.formattedAddress} → {shipment.dropoff.formattedAddress}
          </h1>
        </div>
        <ShipmentStatusBadge status={shipment.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {!isTerminal ? (
            <Card>
              <CardContent className="pt-6">
                <ShipmentWorkflow
                  shipmentId={shipment.id}
                  status={shipment.status}
                  pickup={shipment.pickup.coordinates}
                  dropoff={shipment.dropoff.coordinates}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                {shipment.status === 'delivered' ? 'This delivery is complete.' : null}
                {shipment.status === 'delivery_failed' ? 'This delivery attempt failed.' : null}
                {shipment.status === 'cancelled' ? 'This delivery was cancelled.' : null}
                {shipment.status === 'returned' ? 'This shipment was returned.' : null}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 text-sm">
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
              <div className="grid grid-cols-2 gap-4 border-t pt-3 font-brand-mono">
                <div>
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <p>{shipment.distanceKm.toFixed(1)} km</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Estimated time</p>
                  <p>{formatEta(shipment.durationMinutes)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Package</span>
                <span>{shipment.packageDescription}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quantity</span>
                <span>{shipment.packageQuantity}</span>
              </div>
              {shipment.isFragile ? <p className="text-warning-foreground">Marked fragile</p> : null}
              {packageImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL
                <img src={packageImageUrl} alt="Package" className="mt-1 h-32 w-32 rounded-md object-cover" />
              ) : null}
              {shipment.paymentMethod === 'cod' ? (
                <p className="border-t pt-2 font-brand-mono">
                  Collect {shipment.currency} {shipment.price.toFixed(2)} on delivery
                </p>
              ) : null}
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

export default DriverDeliveryDetailPage;
