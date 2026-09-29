'use client';

import { useId, useState } from 'react';
import { CircleAlert } from 'lucide-react';

import PriceBreakdownList from '@/components/pricing/price-breakdown-list';
import { calculateShipmentPrice } from '@/lib/pricing/calculate';
import { DELIVERY_TYPE_COPY } from '@/lib/pricing/config';
import { DELIVERY_TYPES } from '@/lib/types';
import { cn } from '@/lib/utils';

import type { DeliveryType, PricingRule } from '@/lib/types';

type FareCalculatorProps = {
  // One rule (the manager's preview) or one per delivery type (landing page).
  rules: Partial<Record<DeliveryType, PricingRule>>;
  defaultDeliveryType?: DeliveryType;
  className?: string;
};

// Runs the same pricing engine as booking and the database check, so the
// estimate here is exactly what the customer would pay for that distance
// and weight.
const FareCalculator = ({ rules, defaultDeliveryType = 'next_day', className = '' }: FareCalculatorProps) => {
  const available = DELIVERY_TYPES.filter((type) => rules[type]);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(
    available.includes(defaultDeliveryType) ? defaultDeliveryType : available[0],
  );
  const [distanceKm, setDistanceKm] = useState(10);
  const [weightKg, setWeightKg] = useState(5);
  const ids = useId();

  const rule = rules[deliveryType] ?? rules[available[0]]!;
  // Let the slider go a little past the limit, so the restriction is visible.
  const sliderMax = Math.ceil(rule.maxDistanceKm + 10);
  const breakdown = calculateShipmentPrice({ rule, distanceKm, weightKg });

  return (
    <div className={cn('flex flex-col gap-6 rounded-2xl border border-brand-ink/10 bg-white p-6 shadow-sm md:p-8', className)}>
      {available.length > 1 ? (
        <div role="radiogroup" aria-label="Delivery service" className="grid grid-cols-2 gap-1 rounded-xl bg-brand-ink/5 p-1">
          {available.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={deliveryType === type}
              onClick={() => setDeliveryType(type)}
              className={cn(
                'min-h-11 rounded-lg px-3 text-sm font-medium transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none',
                deliveryType === type ? 'bg-white text-brand-ink shadow-sm' : 'text-brand-ink/60 hover:text-brand-ink',
              )}
            >
              {DELIVERY_TYPE_COPY[type].label}
            </button>
          ))}
        </div>
      ) : null}

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={`${ids}-distance`} className="text-sm text-brand-ink/70">
            Trip distance
          </label>
          <output htmlFor={`${ids}-distance`} className="font-brand-mono text-lg text-brand-ink">
            {distanceKm} km
          </output>
        </div>
        <input
          id={`${ids}-distance`}
          type="range"
          min={1}
          max={sliderMax}
          value={Math.min(distanceKm, sliderMax)}
          onChange={(event) => setDistanceKm(Number(event.target.value))}
          className="mt-3 h-2 w-full cursor-pointer accent-brand-route"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={`${ids}-weight`} className="text-sm text-brand-ink/70">
            Parcel weight
          </label>
          <output htmlFor={`${ids}-weight`} className="font-brand-mono text-lg text-brand-ink">
            {weightKg} kg
          </output>
        </div>
        <input
          id={`${ids}-weight`}
          type="range"
          min={1}
          max={60}
          value={weightKg}
          onChange={(event) => setWeightKg(Number(event.target.value))}
          className="mt-3 h-2 w-full cursor-pointer accent-brand-route"
        />
      </div>

      <div className="border-t border-brand-ink/10 pt-5" aria-live="polite">
        {breakdown.exceedsDistanceLimit ? (
          <p className="flex items-start gap-2 rounded-xl bg-destructive/5 p-4 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            Deliveries over {rule.maxDistanceKm} km can’t be booked online. Contact us for long-distance deliveries.
          </p>
        ) : (
          <PriceBreakdownList
            className="text-brand-ink"
            currency={breakdown.currency}
            total={breakdown.totalPrice}
            basePrice={breakdown.basePrice}
            distanceCharge={breakdown.distanceCharge}
            weightCharge={breakdown.weightCharge}
            codCharge={breakdown.codCharge}
            additionalDistanceKm={breakdown.additionalDistanceKm}
            additionalWeightKg={breakdown.additionalWeightKg}
            totalLabel="Estimated delivery fee"
          />
        )}
      </div>
    </div>
  );
};

export default FareCalculator;
