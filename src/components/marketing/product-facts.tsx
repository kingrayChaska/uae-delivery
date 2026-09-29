import Reveal from '@/components/marketing/reveal';

import type { PricingRule } from '@/lib/types';

// Trust indicators drawn from how the product actually works — live
// pricing rules and real features — rather than marketing statistics.
const ProductFacts = ({ nextDay, sameDay }: { nextDay: PricingRule; sameDay: PricingRule }) => {
  const facts = [
    { value: `${nextDay.currency} ${nextDay.basePrice.toFixed(0)}`, label: `Next-day delivery, first ${nextDay.baseDistanceKm} km` },
    { value: `${sameDay.includedWeightKg} kg`, label: 'Included in every delivery price' },
    { value: `${Math.max(nextDay.maxDistanceKm, sameDay.maxDistanceKm)} km`, label: 'Delivery range per shipment' },
    { value: '4 ways', label: 'We prove delivery: photo, signature, code or QR' },
  ];

  return (
    <section aria-label="ParcelLink at a glance" className="border-b border-brand-ink/10 bg-white">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-brand-ink/10 md:grid-cols-4">
        {facts.map((fact, index) => (
          <Reveal key={fact.label} delay={index * 80} className="flex flex-col gap-1 bg-white px-4 py-6 sm:px-6 md:py-8">
            <dt className="order-2 text-sm text-brand-ink/60">{fact.label}</dt>
            <dd className="order-1 font-display text-2xl font-semibold text-brand-ink md:text-3xl">{fact.value}</dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
};

export default ProductFacts;
