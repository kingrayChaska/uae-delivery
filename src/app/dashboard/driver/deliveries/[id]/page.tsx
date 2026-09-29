import { notFound } from 'next/navigation';

import { Card, CardContent } from '@/components/ui/card';
import AddressBlock from '@/components/shipment/address-block';
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
  // Same split the COD record uses (sync_shipment_cod_transaction, 0022).
  const collectGoods = shipment.recipientPaymentType === 'postpaid' ? shipment.codAmount : 0;
  const collectFee = shipment.paymentMethod === 'cod' ? shipment.price : 0;

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
              <AddressBlock heading="Pickup" address={shipment.pickup} showNavigation />
              <AddressBlock heading="Delivery" address={shipment.dropoff} showNavigation />
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
              {collectGoods + collectFee > 0 ? (
                <div className="flex flex-col gap-1 rounded-xl border-2 border-primary/30 bg-secondary/40 p-3 font-brand-mono">
                  <p className="font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collect on delivery</p>
                  {collectGoods > 0 ? (
                    <p className="flex justify-between gap-4">
                      <span>Goods (from recipient)</span>
                      <span>
                        {shipment.currency} {collectGoods.toFixed(2)}
                      </span>
                    </p>
                  ) : null}
                  {collectFee > 0 ? (
                    <p className="flex justify-between gap-4">
                      <span>Delivery fee (cash)</span>
                      <span>
                        {shipment.currency} {collectFee.toFixed(2)}
                      </span>
                    </p>
                  ) : null}
                  <p className="flex justify-between gap-4 border-t pt-1 text-base font-semibold">
                    <span>Total cash</span>
                    <span>
                      {shipment.currency} {(collectGoods + collectFee).toFixed(2)}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="border-t pt-2 text-muted-foreground">Prepaid — nothing to collect.</p>
              )}
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
