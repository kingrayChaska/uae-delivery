import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CircleCheck, Printer } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import Button from '@/components/ui/button';
import AddressBlock from '@/components/shipment/address-block';
import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import TrackingTimeline from '@/components/shipment/tracking-timeline';
import TrackingCode from '@/components/shipment/tracking-code';
import CancelShipmentButton from '@/components/shipment/cancel-shipment-button';
import ProofOfDeliveryButton from '@/components/shipment/proof-of-delivery';
import ShipmentChargesCard from '@/components/shipment/shipment-charges-card';
import RouteMap from '@/components/maps/lazy-route-map';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { isUuid } from '@/lib/security/validate';
import { getShipmentDetail } from '@/services/shipments/get-shipment';
import { getProofOfDelivery } from '@/services/shipments/get-proof-of-delivery';
import { formatShipmentStatus } from '@/lib/shipment/format';
import { getTerminalNegativeMessage, getTrackingMilestones } from '@/lib/shipment/tracking-milestones';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Shipment details · ParcelLink' };

const CANCELLABLE_STATUSES = ['pending_payment', 'confirmed', 'assigned', 'driver_accepted'];
const ROUTE_VISIBLE_STATUSES = ['assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination', 'delivered'];

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('en-AE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' }).format(new Date(value));

const ShipmentDetailPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ booked?: string }>;
}) => {
  await requireRoleOrRedirect('customer');
  const [{ id }, { booked }] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();

  const detail = await getShipmentDetail(id);
  if (!detail) notFound();

  const { shipment, history, packageImageUrl } = detail;
  const proof = shipment.status === 'delivered' ? await getProofOfDelivery(shipment.id) : null;
  const terminalMessage = getTerminalNegativeMessage(shipment.status);
  const milestones = getTrackingMilestones(shipment.status, history);
  const dimensions = [shipment.packageLengthCm, shipment.packageWidthCm, shipment.packageHeightCm];

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Link href="/dashboard/customer/deliveries" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        My deliveries
      </Link>

      {booked === '1' ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/50 bg-success/10 p-4 text-sm animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>
            <span className="font-medium">Booking confirmed.</span> Share the tracking ID with your recipient so they can follow the delivery.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <TrackingCode code={shipment.trackingNumber} size="lg" />
          <h1 className="text-xl font-semibold leading-snug sm:text-2xl">
            <span className="break-words">{shipment.pickup.formattedAddress}</span>
            <span className="text-primary" aria-label="to"> → </span>
            <span className="break-words">{shipment.dropoff.formattedAddress}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShipmentStatusBadge status={shipment.status} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/customer/deliveries/${shipment.id}/label`}>
              <Printer aria-hidden />
              Label
            </Link>
          </Button>
          {CANCELLABLE_STATUSES.includes(shipment.status) ? <CancelShipmentButton shipmentId={shipment.id} /> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <Card>
            <CardContent className="flex flex-col gap-5 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Tracking</h2>
                <span className="text-sm text-muted-foreground">Now: {formatShipmentStatus(shipment.status)}</span>
              </div>
              <TrackingTimeline milestones={milestones} terminalMessage={terminalMessage} />
              <div className="border-t pt-4">
                <ProofOfDeliveryButton proof={proof} status={shipment.status} trackingCode={shipment.trackingNumber} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-5 pt-6 text-sm sm:grid-cols-2">
              <AddressBlock heading="Pickup" address={shipment.pickup} />
              <AddressBlock heading="Delivery" address={shipment.dropoff} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 text-sm">
              <h2 className="text-lg font-semibold">Package</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Contents</dt>
                  <dd className="font-medium">{shipment.packageDescription}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Quantity</dt>
                  <dd className="font-medium">{shipment.packageQuantity}</dd>
                </div>
                {shipment.packageWeightKg ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Weight</dt>
                    <dd className="font-medium">{shipment.packageWeightKg} kg</dd>
                  </div>
                ) : null}
                {dimensions.every((d) => d !== null) ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Dimensions</dt>
                    <dd className="font-medium">{dimensions.join(' × ')} cm</dd>
                  </div>
                ) : null}
              </dl>
              {shipment.isFragile ? <p className="font-medium text-warning-foreground">Marked fragile</p> : null}
              {packageImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a static/remote-optimizable asset
                <img src={packageImageUrl} alt={`Package photo: ${shipment.packageDescription}`} className="mt-1 size-32 rounded-xl object-cover" />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <ShipmentChargesCard shipment={shipment} />

          {ROUTE_VISIBLE_STATUSES.includes(shipment.status) ? (
            <RouteMap pickup={shipment.pickup.coordinates} dropoff={shipment.dropoff.coordinates} className="h-72 w-full rounded-2xl" />
          ) : null}

          <details className="rounded-2xl border bg-card p-4 text-sm shadow-sm">
            <summary className="cursor-pointer select-none font-medium">Full status history</summary>
            <ul className="mt-3 flex flex-col gap-1.5">
              {history.map((entry) => (
                <li key={`${entry.status}-${entry.createdAt}`} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{formatShipmentStatus(entry.status)}</span>
                  <time dateTime={entry.createdAt} className="font-brand-mono text-xs">
                    {formatTime(entry.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </main>
  );
};

export default ShipmentDetailPage;
