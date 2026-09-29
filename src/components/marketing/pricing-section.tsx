import Link from 'next/link';
import { ArrowRight, Building2, CalendarClock, Check, Scale, Zap } from 'lucide-react';

import Button from '@/components/ui/button';
import FareCalculator from '@/components/pricing/fare-calculator';
import Reveal from '@/components/marketing/reveal';

import type { DeliveryType, PricingRule } from '@/lib/types';

const money = (rule: PricingRule, value: number) => `${rule.currency} ${Number.isInteger(value) ? value : value.toFixed(2)}`;

type PricingSectionProps = {
  rules: Record<DeliveryType, PricingRule>;
};

// Numbers come from the active pricing rules (the same ones every booking is
// priced and database-checked with), so the landing page can't drift from
// what customers are actually charged.
const PricingSection = ({ rules }: PricingSectionProps) => {
  const { next_day: nextDay, same_day: sameDay } = rules;

  const plans = [
    {
      rule: nextDay,
      icon: CalendarClock,
      name: 'Next-Day Delivery',
      tagline: 'Our lowest price — delivered tomorrow.',
      featured: true,
    },
    {
      rule: sameDay,
      icon: Zap,
      name: 'Same-Day Delivery',
      tagline: 'Collected and delivered today.',
      featured: false,
    },
  ];

  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">Pricing</p>
          <h2 id="pricing-heading" className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            Simple delivery pricing, shown before you book
          </h2>
          <p className="mt-3 text-lg text-brand-ink/65">
            A base price that covers the first few kilometres, a small charge per extra kilometre, and heavy parcels priced by
            weight. No surge pricing.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {plans.map(({ rule, icon: Icon, name, tagline, featured }, index) => (
            <Reveal key={name} delay={index * 100}>
              <article
                className={`relative flex h-full flex-col gap-5 rounded-3xl border p-5 transition-shadow hover:shadow-xl sm:p-8 ${
                  featured ? 'border-brand-route bg-brand-route-deep text-brand-paper shadow-lg' : 'border-brand-ink/10 bg-brand-paper text-brand-ink'
                }`}
              >
                {featured ? (
                  <span className="absolute right-6 top-6 rounded-full bg-brand-signal px-3 py-1 text-xs font-semibold text-brand-route-deep">
                    Best value
                  </span>
                ) : null}
                <span className={`flex size-12 items-center justify-center rounded-2xl ${featured ? 'bg-brand-paper/10' : 'bg-brand-route/10 text-brand-route'}`}>
                  <Icon className="size-6" aria-hidden />
                </span>
                <div>
                  <h3 className="font-display text-2xl font-semibold">{name}</h3>
                  <p className={featured ? 'text-brand-paper/70' : 'text-brand-ink/60'}>{tagline}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-display text-3xl font-semibold sm:text-4xl">{money(rule, rule.basePrice)}</p>
                    <p className={`text-sm ${featured ? 'text-brand-paper/70' : 'text-brand-ink/60'}`}>First {rule.baseDistanceKm} km</p>
                  </div>
                  <div>
                    <p className="font-display text-3xl font-semibold sm:text-4xl">+{money(rule, rule.additionalPricePerKm)}</p>
                    <p className={`text-sm ${featured ? 'text-brand-paper/70' : 'text-brand-ink/60'}`}>For each additional km</p>
                  </div>
                </div>
                <ul className={`flex flex-col gap-2 text-sm ${featured ? 'text-brand-paper/85' : 'text-brand-ink/75'}`}>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-signal" aria-hidden />
                    Up to {rule.includedWeightKg} kg included in the base price
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-signal" aria-hidden />
                    Live tracking and proof of delivery
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-signal" aria-hidden />
                    Deliveries up to {rule.maxDistanceKm} km
                  </li>
                </ul>
                <Button
                  asChild
                  size="lg"
                  className={`mt-auto ${featured ? 'bg-brand-signal text-brand-route-deep hover:bg-brand-signal/90' : 'bg-brand-route text-brand-paper hover:bg-brand-route/90'}`}
                >
                  <Link href="/register">
                    Book {name.toLowerCase()}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-5 grid gap-5 lg:grid-cols-5">
          <div className="flex flex-col gap-4 rounded-3xl border border-brand-ink/10 bg-brand-paper p-6 sm:p-8 lg:col-span-2">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-route/10 text-brand-route">
              <Scale className="size-6" aria-hidden />
            </span>
            <h3 className="font-display text-xl font-semibold text-brand-ink">Heavier parcels</h3>
            <div className="grid grid-cols-2 gap-4 text-brand-ink">
              <div>
                <p className="font-display text-3xl font-semibold">{sameDay.includedWeightKg} kg</p>
                <p className="text-sm text-brand-ink/60">Included in the base price</p>
              </div>
              <div>
                <p className="font-display text-3xl font-semibold">+{money(sameDay, sameDay.additionalPricePerKg)}</p>
                <p className="text-sm text-brand-ink/60">For every kg above {sameDay.includedWeightKg} kg</p>
              </div>
            </div>
            <p className="text-sm text-brand-ink/60">
              Your final price depends on the service you choose, the road distance, the weight and any cash-on-delivery handling.
              You always see the full breakdown before you confirm.
            </p>
            <div className="mt-auto flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-brand-ink/75">
              <Building2 className="mt-0.5 size-5 shrink-0 text-brand-route" aria-hidden />
              <p>
                <span className="font-semibold text-brand-ink">Shipping for a business?</span> Approved merchants get flat-rate
                pricing.{' '}
                <Link href="/#merchants" className="font-semibold text-brand-route hover:underline">
                  Learn about merchant accounts
                </Link>
              </p>
            </div>
          </div>
          <div className="lg:col-span-3">
            <h3 className="sr-only">Delivery price calculator</h3>
            <FareCalculator rules={rules} className="h-full" />
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default PricingSection;
