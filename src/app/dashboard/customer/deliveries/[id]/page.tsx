import { notFound } from 'next/navigation';

import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

import Button from '@/components/ui/button';
import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import TrackingTimeline from '@/components/shipment/tracking-timeline';
import CancelShipmentButton from '@/components/shipment/cancel-shipment-button';
import RouteMap from '@/components/maps/lazy-route-map';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getShipmentDetail } from '@/services/shipments/get-shipment';
import { formatEta, formatShipmentStatus } from '@/lib/shipment/format';
import { getTerminalNegativeMessage, getTrackingMilestones } from '@/lib/shipment/tracking-milestones';

const CANCELLABLE_STATUSES = ['pending_payment', 'confirmed', 'assigned', 'driver_accepted'];
const ROUTE_VISIBLE_STATUSES = [
  'assigned',
  'driver_accepted',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
  'delivered',
];

const ShipmentDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('customer');
  const { id } = await params;

  const detail = await getShipmentDetail(id);
  if (!detail) notFound();

  const { shipment, history, packageImageUrl } = detail;
  const terminalMessage = getTerminalNegativeMessage(shipment.status);
  const milestones = getTrackingMilestones(shipment.status);

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
            <Link href={`/dashboard/customer/deliveries/${shipment.id}/label`}>View label</Link>
          </Button>
          <ShipmentStatusBadge status={shipment.status} />
        </div>
      </div>

      {CANCELLABLE_STATUSES.includes(shipment.status) ? (
        <div className="flex justify-end">
          <CancelShipmentButton shipmentId={shipment.id} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              {terminalMessage ? (
                <p className="text-sm text-muted-foreground">{terminalMessage}</p>
              ) : (
                <TrackingTimeline milestones={milestones} />
              )}
            </CardContent>
          </Card>

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
              {shipment.packageWeightKg ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Weight</span>
                  <span>{shipment.packageWeightKg} kg</span>
                </div>
              ) : null}
              {shipment.isFragile ? <p className="text-warning-foreground">Marked fragile</p> : null}
              {packageImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a static/remote-optimizable asset
                <img src={packageImageUrl} alt="Package" className="mt-1 h-32 w-32 rounded-md object-cover" />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-2 pt-6 font-brand-mono text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Payment method</span>
                <span className="uppercase">{shipment.paymentMethod}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Payment status</span>
                <span className="capitalize">{shipment.paymentStatus}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-medium text-foreground">
                <span>Total</span>
                <span>
                  {shipment.currency} {shipment.price.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {ROUTE_VISIBLE_STATUSES.includes(shipment.status) ? (
            <RouteMap pickup={shipment.pickup.coordinates} dropoff={shipment.dropoff.coordinates} className="h-80 w-full rounded-md" />
          ) : null}

          <Card>
            <CardContent className="pt-6">
              <p className="mb-2 text-sm font-medium">Full history</p>
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
      </div>
    </main>
  );
};

export default ShipmentDetailPage;
