import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import AddressBlock from '@/components/shipment/address-block';
import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import RouteMap from '@/components/maps/lazy-route-map';
import MarkReturnedButton from '@/components/operator/mark-returned-button';
import CorrectStatusButton from '@/components/operator/correct-status-button';
import RealtimeRefresh from '@/components/dashboard/realtime-refresh';
import Badge from '@/components/ui/badge';
import ReassignDriverSection from '@/components/operator/reassign-driver-section';
import ShipmentChargesCard from '@/components/shipment/shipment-charges-card';
import ProofOfDeliveryButton from '@/components/shipment/proof-of-delivery';
import TrackingCode from '@/components/shipment/tracking-code';
import { getShipmentDetail } from '@/services/shipments/get-shipment';
import { getProofOfDelivery } from '@/services/shipments/get-proof-of-delivery';
import { getOutcomeProof } from '@/services/shipments/get-outcome-proof';
import { getProfileName } from '@/services/profiles/get-profile-name';
import { getBatchLabel } from '@/services/bulk/list-batches';
import { getInvoiceNumberFor } from '@/services/invoices/get-invoice';
import { getCurrentProfile } from '@/lib/auth/session';
import { correctionTargets } from '@/lib/shipment/status-corrections';
import { getFormat } from '@/i18n/server';

import type { StaffDetailViewProps } from '@/components/staff-views/types';

const ShipmentDetailView = async ({ basePath, id }: StaffDetailViewProps) => {
  const detail = await getShipmentDetail(id);
  if (!detail) notFound();

  const { shipment, history } = detail;
  const [viewer, driverName, customerName, bookedByName, batch, proof, outcomeProof, t, tShipments, tInvoices, format, invoiceNumber] = await Promise.all([
    getCurrentProfile(),
    getProfileName(shipment.driverId),
    getProfileName(shipment.customerId),
    // Who entered it, when that wasn't the customer themselves.
    shipment.bookedBy && shipment.bookedBy !== shipment.customerId ? getProfileName(shipment.bookedBy) : Promise.resolve(null),
    getBatchLabel(shipment.batchId),
    shipment.status === 'delivered' ? getProofOfDelivery(shipment.id) : Promise.resolve(null),
    // The driver's photo when they cancelled or returned it (migration 0037).
    shipment.status === 'cancelled' || shipment.status === 'returned' ? getOutcomeProof(shipment.id) : Promise.resolve(null),
    getTranslations('operator.shipmentDetail'),
    getTranslations('shipments'),
    getTranslations('invoices.actions'),
    getFormat(),
    // Staff can read invoices but never issue them (migration 0031).
    getInvoiceNumberFor({ shipmentId: shipment.id }),
  ]);

  // Why it ended without a delivery: cancelled (by the customer, staff or —
  // before pickup — the driver), failed, or returned to the sender.
  const outcomeReason =
    shipment.status === 'cancelled'
      ? shipment.cancelledReason
      : shipment.status === 'delivery_failed' || shipment.status === 'returned'
        ? shipment.deliveryFailedReason
        : null;
  const canAssign = shipment.status === 'confirmed' && !shipment.driverId;
  const canReassign = shipment.status === 'assigned' || shipment.status === 'delivery_failed';
  // Correcting a status a driver set by mistake (migration 0041).
  const correctTo = correctionTargets(shipment.status, {
    isManager: viewer?.role === 'manager',
    hasDriver: shipment.driverId !== null,
  });
  const packageDetails = [
    t('packageLine', { quantity: format.number(shipment.packageQuantity), description: shipment.packageDescription }),
    shipment.packageWeightKg ? format.kg(shipment.packageWeightKg) : null,
    shipment.isFragile ? tShipments('fragile') : null,
  ].filter(Boolean);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      {/* A driver's update (or another operator's) shows up without a reload. */}
      <RealtimeRefresh table="shipments" filter={`id=eq.${shipment.id}`} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <TrackingCode code={shipment.trackingNumber} />
          <h1 className="wrap-break-word text-xl font-semibold sm:text-2xl">
            {shipment.pickup.formattedAddress} <span className="inline-block rtl:rotate-180">→</span> {shipment.dropoff.formattedAddress}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`${basePath}/shipments/${shipment.id}/label`}>{t('viewLabel')}</Link>
          </Button>
          {invoiceNumber ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`${basePath}/invoices/${invoiceNumber}`}>{tInvoices('view')}</Link>
            </Button>
          ) : null}
          <ShipmentStatusBadge status={shipment.status} />
          {shipment.status === 'delivery_failed' ? <MarkReturnedButton shipmentId={shipment.id} /> : null}
          {correctTo.length > 0 ? (
            <CorrectStatusButton shipmentId={shipment.id} currentStatus={shipment.status} targets={correctTo} />
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('customer')}</span>
                {shipment.guestCustomer ? (
                  <span className="flex flex-col items-end gap-1 text-end">
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <span className="wrap-break-word">{shipment.guestCustomer.name}</span>
                      <Badge variant="secondary">{t('noAccount')}</Badge>
                    </span>
                    <a href={`tel:${shipment.guestCustomer.phone.replace(/[^\d+]/g, '')}`} dir="ltr" className="font-brand-mono hover:underline">
                      {shipment.guestCustomer.phone}
                    </a>
                  </span>
                ) : (
                  <span className="wrap-break-word text-end">{customerName ?? '—'}</span>
                )}
              </div>
              {bookedByName ? (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('bookedBy')}</span>
                  <span className="wrap-break-word text-end">{bookedByName}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('driver')}</span>
                <span>{driverName ?? t('unassigned')}</span>
              </div>
              {outcomeReason ? (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('outcomeReason', { status: tShipments(`status.${shipment.status}`) })}</span>
                  <span className="wrap-break-word text-end">{outcomeReason}</span>
                </div>
              ) : null}
              {outcomeProof?.photoUrl ? (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('outcomePhoto')}</span>
                  <a
                    href={outcomeProof.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Supabase Storage URL */}
                    <img
                      src={outcomeProof.photoUrl}
                      alt={t('outcomePhotoAlt', { status: tShipments(`status.${shipment.status}`) })}
                      className="size-24 rounded-md border object-cover"
                    />
                  </a>
                </div>
              ) : null}
              {batch ? (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('batch')}</span>
                  <Link href={`${basePath}/bulk/${batch.id}`} className="text-end hover:underline">
                    <span dir="ltr" className="font-brand-mono">
                      {batch.reference}
                    </span>
                    {batch.sender ? <span className="text-muted-foreground"> · {batch.sender}</span> : null}
                  </Link>
                </div>
              ) : null}
              <AddressBlock heading={tShipments('detail.pickup')} address={shipment.pickup} />
              <AddressBlock heading={tShipments('detail.delivery')} address={shipment.dropoff} />
              <div className="grid grid-cols-2 gap-4 border-t pt-3 font-brand-mono">
                <div>
                  <p className="font-sans text-xs text-muted-foreground">{t('distance')}</p>
                  <p>{format.km(shipment.distanceKm)}</p>
                </div>
                <div>
                  <p className="font-sans text-xs text-muted-foreground">{t('driveTime')}</p>
                  <p>{format.duration(shipment.durationMinutes)}</p>
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">{t('package')}</p>
                <p>{packageDetails.join(' · ')}</p>
              </div>
            </CardContent>
          </Card>

          {canAssign || canReassign ? (
            <Card>
              <CardContent className="pt-6">
                <p className="mb-3 text-sm font-medium">{canAssign ? t('assign') : t('reassign')}</p>
                <ReassignDriverSection
                  shipmentId={shipment.id}
                  pickup={shipment.pickup.coordinates}
                  mode={canAssign ? 'assign' : 'reassign'}
                  currentDriverId={shipment.driverId}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="pt-6">
              <p className="mb-2 text-sm font-medium">{t('history')}</p>
              <ul className="flex flex-col gap-1 text-sm">
                {history.map((entry, index) =>
                  entry.eventType === 'correction' ? (
                    <li key={`${index}-${entry.createdAt}`} className="flex flex-col gap-0.5 rounded-md bg-secondary/60 px-2 py-1.5">
                      <span className="flex justify-between gap-4">
                        <span>
                          {t('correctedEntry', {
                            from: entry.previousStatus ? tShipments(`status.${entry.previousStatus}`) : '—',
                            to: tShipments(`status.${entry.status}`),
                          })}
                        </span>
                        <span className="font-brand-mono">{format.dateTime(entry.createdAt)}</span>
                      </span>
                      {entry.note ? <span className="wrap-break-word text-muted-foreground">{entry.note}</span> : null}
                    </li>
                  ) : (
                    <li key={`${index}-${entry.createdAt}`} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{tShipments(`status.${entry.status}`)}</span>
                      <span className="font-brand-mono">{format.dateTime(entry.createdAt)}</span>
                    </li>
                  ),
                )}
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
