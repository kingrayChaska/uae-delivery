import { cn } from '@/lib/utils';

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

const money = (currency: string, value: number) => `${currency} ${value.toFixed(2)}`;

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
  totalLabel = 'Delivery fee',
  className = '',
}: PriceBreakdownListProps) => {
  const rows: [string, number][] = [];
  if (basePrice !== null) rows.push(['Base price', basePrice]);
  if (distanceCharge) {
    rows.push([
      additionalDistanceKm ? `Distance (+${additionalDistanceKm.toFixed(1)} km)` : 'Distance charge',
      distanceCharge,
    ]);
  }
  if (weightCharge) {
    rows.push([
      additionalWeightKg ? `Weight (+${additionalWeightKg.toFixed(1)} kg over allowance)` : 'Weight charge',
      weightCharge,
    ]);
  }
  if (codCharge) rows.push(['Cash-on-delivery handling', codCharge]);

  return (
    <dl className={cn('flex flex-col gap-1.5 font-brand-mono text-sm', className)}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 text-muted-foreground">
          <dt>{label}</dt>
          <dd>{money(currency, value)}</dd>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-4 border-t pt-2 text-base font-semibold text-foreground">
        <dt>{totalLabel}</dt>
        <dd>{money(currency, total)}</dd>
      </div>
    </dl>
  );
};

export default PriceBreakdownList;
