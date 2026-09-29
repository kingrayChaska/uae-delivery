import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { useFormat } from '@/i18n/hooks';

type PriceBreakdownListProps = {
  currency: string;
  total: number;
  basePrice: number | null;
  distanceCharge: number | null;
  weightCharge: number | null;
  codCharge: number | null;
  // Optional detail for the labels ("Distance (+9.6 km)").
  additionalDistanceKm?: number;
  additionalWeightKg?: number;
  totalLabel?: string;
  className?: string;
};

// One place that renders a delivery fee breakdown, so the wizard, shipment
// pages and manager records all describe a price the same way. Shipments
// booked before itemised pricing only have a total (components are null).
const PriceBreakdownList = ({
  currency,
  total,
  basePrice,
  distanceCharge,
  weightCharge,
  codCharge,
  additionalDistanceKm,
  additionalWeightKg,
  totalLabel,
  className = '',
}: PriceBreakdownListProps) => {
  const t = useTranslations('pricing.breakdown');
  const format = useFormat();
  const rows: [string, number][] = [];
  if (basePrice !== null) rows.push([t('basePrice'), basePrice]);
  if (distanceCharge) {
    rows.push([additionalDistanceKm ? t('distance', { distance: format.km(additionalDistanceKm) }) : t('distanceCharge'), distanceCharge]);
  }
  if (weightCharge) {
    rows.push([additionalWeightKg ? t('weight', { weight: format.kg(additionalWeightKg, 1) }) : t('weightCharge'), weightCharge]);
  }
  if (codCharge) rows.push([t('cod'), codCharge]);

  return (
    <dl className={cn('flex flex-col gap-1.5 font-brand-mono text-sm', className)}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 text-muted-foreground">
          <dt className="font-sans">{label}</dt>
          <dd>{format.money(value, currency)}</dd>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-4 border-t pt-2 text-base font-semibold text-foreground">
        <dt className="font-sans">{totalLabel ?? t('deliveryFee')}</dt>
        <dd>{format.money(total, currency)}</dd>
      </div>
    </dl>
  );
};

export default PriceBreakdownList;
