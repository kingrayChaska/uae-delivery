'use client';

import { useState } from 'react';

import { calculatePrice } from '@/lib/pricing/calculate';

import type { PricingRule } from '@/lib/types';

type FareCalculatorProps = {
  rule: PricingRule;
};

const MIN_KM = 1;
const MAX_KM = 40;

const FareCalculator = ({ rule }: FareCalculatorProps) => {
  const [distanceKm, setDistanceKm] = useState(10);
  const breakdown = calculatePrice(distanceKm, 0, rule);

  return (
    <div className="rounded border border-brand-ink/10 bg-white p-6 md:p-8">
      <div className="flex items-baseline justify-between">
        <label htmlFor="distance" className="text-sm text-brand-ink/60">
          Trip distance
        </label>
        <span className="font-brand-mono text-lg text-brand-ink">{distanceKm} km</span>
      </div>

      <input
        id="distance"
        type="range"
        min={MIN_KM}
        max={MAX_KM}
        value={distanceKm}
        onChange={(event) => setDistanceKm(Number(event.target.value))}
        className="mt-3 w-full accent-brand-route"
      />

      <div className="mt-6 flex flex-col gap-2 border-t border-brand-ink/10 pt-6 font-brand-mono text-sm">
        <div className="flex justify-between text-brand-ink/60">
          <span>
            Base ({rule.baseDistanceKm} km)
          </span>
          <span>
            {rule.currency} {breakdown.basePrice.toFixed(2)}
          </span>
        </div>
        {breakdown.additionalDistanceKm > 0 ? (
          <div className="flex justify-between text-brand-ink/60">
            <span>Additional {breakdown.additionalDistanceKm.toFixed(1)} km</span>
            <span>
              {rule.currency} {breakdown.additionalPrice.toFixed(2)}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-brand-ink/10 pt-2 text-base font-medium text-brand-ink">
          <span>Delivery fee</span>
          <span>
            {rule.currency} {breakdown.totalPrice.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default FareCalculator;
