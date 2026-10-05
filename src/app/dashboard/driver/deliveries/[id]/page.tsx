import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import AddressBlock from '@/components/shipment/address-block';
import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import ShipmentWorkflow from '@/components/driver/shipment-workflow';
import RouteMap from '@/components/maps/lazy-route-map';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { cashCollection } from '@/lib/shipment/collection';
import { getShipmentDetail } from '@/services/shipments/get-shipment';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('driver.detail'))('meta'),
});

const TERMINAL_MESSAGES = {
  delivered: 'complete',
  delivery_failed: 'failed',
  cancelled: 'cancelled',
  returned: 'returned',
} as const;

const DriverDeliveryDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('driver');
  const { id } = await params;

  const detail = await getShipmentDetail(id);
  if (!detail) notFound();

  const [t, tShipments, format] = await Promise.all([
    getTranslations('driver.detail'),
    getTranslations('shipments.detail'),
    getFormat(),
  ]);
  const { shipment, packageImageUrl } = detail;
  const terminal = shipment.status in TERMINAL_MESSAGES ? TERMINAL_MESSAGES[shipment.status as keyof typeof TERMINAL_MESSAGES] : null;
  // The recipient pays the COD amount only — the delivery fee is the
  // sender's and is never added on top (lib/shipment/collection.ts).
  const { fromRecipient, senderCashFee } = cashCollection(shipment);
  const terminalReason = shipment.status === 'cancelled' ? shipment.cancelledReason : shipment.deliveryFailedReason;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p dir="ltr" className="font-brand-mono text-sm text-muted-foreground rtl:text-right">
            {shipment.trackingNumber}
          </p>
          <h1 className="text-2xl font-semibold">
            {shipment.pickup.formattedAddress} <span className="inline-block rtl:rotate-180">→</span> {shipment.dropoff.formattedAddress}
          </h1>
        </div>
        <ShipmentStatusBadge status={shipment.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {!terminal ? (
            <Card>
              <CardContent className="pt-6">
                <ShipmentWorkflow
                  shipmentId={shipment.id}
                  status={shipment.status}
                  pickup={shipment.pickup.coordinates}
                  dropoff={shipment.dropoff.coordinates}
                  codToCollect={fromRecipient}
                  currency={shipment.currency}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-1 pt-6 text-sm text-muted-foreground">
                <p>{t(terminal)}</p>
                {terminal !== 'complete' && terminalReason ? (
                  <p>
                    {t('reason')}: <span className="text-foreground">{terminalReason}</span>
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 text-sm">
              <AddressBlock heading={tShipments('pickup')} address={shipment.pickup} showNavigation />
              <AddressBlock heading={tShipments('delivery')} address={shipment.dropoff} showNavigation />
              <div className="grid grid-cols-2 gap-4 border-t pt-3 font-brand-mono">
                <div>
                  <p className="font-sans text-xs text-muted-foreground">{t('distance')}</p>
                  <p>{format.km(shipment.distanceKm)}</p>
                </div>
                <div>
                  <p className="font-sans text-xs text-muted-foreground">{t('estimatedTime')}</p>
                  <p>{format.duration(shipment.durationMinutes)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('package')}</span>
                <span className="text-end">{shipment.packageDescription}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('quantity')}</span>
                <span>{format.number(shipment.packageQuantity)}</span>
              </div>
              {shipment.deliveryDate ? (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('deliveryDate')}</span>
                  <span>{format.calendarDate(shipment.deliveryDate)}</span>
                </div>
              ) : null}
              {shipment.isFragile ? <p className="text-warning-foreground">{t('fragile')}</p> : null}
              {packageImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL
                <img src={packageImageUrl} alt={t('photoAlt')} className="mt-1 h-32 w-32 rounded-md object-cover" />
              ) : null}
              {fromRecipient > 0 ? (
                <div className="flex flex-col gap-1 rounded-xl border-2 border-primary/30 bg-secondary/40 p-3 font-brand-mono">
                  <p className="font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('collectTitle')}</p>
                  <p className="flex justify-between gap-4 text-base font-semibold">
                    <span className="font-sans">{t('fromRecipient')}</span>
                    <span>{format.money(fromRecipient, shipment.currency)}</span>
                  </p>
                </div>
              ) : (
                <p className="border-t pt-2 text-muted-foreground">{t('prepaid')}</p>
              )}
              {senderCashFee > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('senderFee', { amount: format.money(senderCashFee, shipment.currency) })}
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
