import { Banknote, CalendarClock, CreditCard, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import PriceBreakdownList from '@/components/pricing/price-breakdown-list';
import { useFormat } from '@/i18n/hooks';

import type { Shipment } from '@/lib/types';

// Three different amounts live on a shipment and must never be confused:
// the delivery fee (ParcelLink's price), the amount the driver collects
// from the recipient for the goods (COD), and the declared product value.
const ShipmentChargesCard = ({ shipment }: { shipment: Shipment }) => {
  const t = useTranslations('shipments');
  const format = useFormat();
  const DeliveryIcon = shipment.deliveryType === 'next_day' ? CalendarClock : Zap;
  const postpaid = shipment.recipientPaymentType === 'postpaid';

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-medium">
            <DeliveryIcon className="size-4 text-primary" aria-hidden />
            {t(`deliveryType.${shipment.deliveryType}.label`)}
          </span>
          <Badge variant="outline">{format.km(shipment.distanceKm)}</Badge>
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
            <dt className="text-xs text-muted-foreground">{t('charges.feePaidBy')}</dt>
            <dd className="flex items-center gap-1.5 font-medium">
              {shipment.paymentMethod === 'card' ? <CreditCard className="size-4" aria-hidden /> : <Banknote className="size-4" aria-hidden />}
              {t('charges.paidWith', {
                method: shipment.paymentMethod === 'card' ? t('charges.card') : t('charges.cash'),
                status: t(`paymentStatus.${shipment.paymentStatus}`),
              })}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('charges.recipientPayment')}</dt>
            <dd className="font-medium">
              {postpaid
                ? t.rich('charges.postpaidCollect', {
                    amount: format.money(shipment.codAmount, shipment.currency),
                    mono: (chunks) => <span className="font-brand-mono">{chunks}</span>,
                  })
                : t('charges.prepaidNothing')}
            </dd>
          </div>
          {shipment.productValue !== null ? (
            <div>
              <dt className="text-xs text-muted-foreground">{t('charges.productValue')}</dt>
              <dd className="font-brand-mono font-medium">{format.money(shipment.productValue, shipment.currency)}</dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
};

export default ShipmentChargesCard;
