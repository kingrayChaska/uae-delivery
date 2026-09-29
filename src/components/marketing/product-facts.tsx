import { getTranslations } from 'next-intl/server';

import Reveal from '@/components/marketing/reveal';
import { getFormat } from '@/i18n/server';

import type { PricingRule } from '@/lib/types';

// Trust indicators drawn from how the product actually works — live
// pricing rules and real features — rather than marketing statistics.
const ProductFacts = async ({ nextDay, sameDay }: { nextDay: PricingRule; sameDay: PricingRule }) => {
  const [t, format] = await Promise.all([getTranslations('marketing.facts'), getFormat()]);
  const facts = [
    {
      value: `${nextDay.currency} ${format.number(nextDay.basePrice, { maximumFractionDigits: 0 })}`,
      label: t('nextDay', { distance: format.km(nextDay.baseDistanceKm, 0) }),
    },
    { value: format.kg(sameDay.includedWeightKg), label: t('includedWeight') },
    { value: format.km(Math.max(nextDay.maxDistanceKm, sameDay.maxDistanceKm), 0), label: t('range') },
    { value: t('proofValue'), label: t('proof') },
  ];

  return (
    <section aria-label={t('label')} className="border-b border-brand-ink/10 bg-white">
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
