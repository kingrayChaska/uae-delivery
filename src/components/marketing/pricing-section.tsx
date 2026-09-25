import FareCalculator from '@/components/pricing/fare-calculator';
import { getActivePricingRule } from '@/lib/pricing/get-active-rule';

const PricingSection = async () => {
  const rule = await getActivePricingRule();

  return (
    <section id="pricing" className="bg-white py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2 md:items-center">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-3xl font-semibold text-brand-ink md:text-4xl">
            Straightforward, distance-based pricing
          </h2>
          <p className="max-w-md text-brand-ink/65">
            The first {rule.baseDistanceKm} km is {rule.currency} {rule.basePrice.toFixed(2)}.
            Every kilometre after that adds {rule.currency} {rule.additionalPricePerKm.toFixed(2)}.
            That&apos;s the whole formula — no hidden fees, no surge pricing.
          </p>
          <p className="text-sm text-brand-ink/45">
            The price shown at checkout always reflects the current rate, calculated from the
            actual road route.
          </p>
        </div>

        <FareCalculator rule={rule} />
      </div>
    </section>
  );
};

export default PricingSection;
