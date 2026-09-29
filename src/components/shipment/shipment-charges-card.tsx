import { Banknote, CalendarClock, CreditCard, Zap } from 'lucide-react';

import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import PriceBreakdownList from '@/components/pricing/price-breakdown-list';
import { DELIVERY_TYPE_COPY } from '@/lib/pricing/config';

import type { Shipment } from '@/lib/types';

const PAYMENT_STATUS_LABELS: Record<Shipment['paymentStatus'], string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};

// Three different amounts live on a shipment and must never be confused:
// the delivery fee (ParcelLink's price), the amount the driver collects
// from the recipient for the goods (COD), and the declared product value.
const ShipmentChargesCard = ({ shipment }: { shipment: Shipment }) => {
  const DeliveryIcon = shipment.deliveryType === 'next_day' ? CalendarClock : Zap;
  const postpaid = shipment.recipientPaymentType === 'postpaid';

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-medium">
            <DeliveryIcon className="size-4 text-primary" aria-hidden />
            {DELIVERY_TYPE_COPY[shipment.deliveryType].label}
          </span>
          <Badge variant="outline">{shipment.distanceKm.toFixed(1)} km</Badge>
        </div>

        <PriceBreakdownList
          currency={shipment.currency}
          total={shipment.price}
          basePrice={shipment.baseCharge}
          distanceCharge={shipment.distanceCharge}
          weightCharge={shipment.weightCharge}
          codCharge={shipment.codCharge}
        />

        <dl className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Delivery fee paid by</dt>
            <dd className="flex items-center gap-1.5 font-medium">
              {shipment.paymentMethod === 'card' ? <CreditCard className="size-4" aria-hidden /> : <Banknote className="size-4" aria-hidden />}
              {shipment.paymentMethod === 'card' ? 'Card' : 'Cash to driver'} · {PAYMENT_STATUS_LABELS[shipment.paymentStatus]}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Recipient payment for goods</dt>
            <dd className="font-medium">
              {postpaid ? (
                <>
                  Postpaid — collect{' '}
                  <span className="font-brand-mono">
                    {shipment.currency} {shipment.codAmount.toFixed(2)}
                  </span>
                </>
              ) : (
                'Prepaid — nothing to collect'
              )}
            </dd>
          </div>
          {shipment.productValue !== null ? (
            <div>
              <dt className="text-xs text-muted-foreground">Product value</dt>
              <dd className="font-brand-mono font-medium">
                {shipment.currency} {shipment.productValue.toFixed(2)}
              </dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
};

export default ShipmentChargesCard;
