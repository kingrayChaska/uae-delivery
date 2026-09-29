import Link from 'next/link';
import { ArrowRight, Building2, CalendarClock, Check, Scale, Zap } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import FareCalculator from '@/components/pricing/fare-calculator';
import Reveal from '@/components/marketing/reveal';
import { localizeHref } from '@/i18n/config';
import { getFormat, getRequestLocale } from '@/i18n/server';

import type { DeliveryType, PricingRule } from '@/lib/types';

type PricingSectionProps = {
  rules: Record<DeliveryType, PricingRule>;
};

// Numbers come from the active pricing rules (the same ones every booking is
// priced and database-checked with), so the landing page can't drift from
// what customers are actually charged.
const PricingSection = async ({ rules }: PricingSectionProps) => {
  const [t, locale, format] = await Promise.all([getTranslations('marketing.pricing'), getRequestLocale(), getFormat()]);
  const { next_day: nextDay, same_day: sameDay } = rules;
  // Whole amounts without decimals ("AED 8"), others with two ("AED 0.75").
  const money = (rule: PricingRule, value: number) =>
    `${rule.currency} ${format.number(value, { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;

  const plans = [
    { key: 'nextDay', rule: nextDay, icon: CalendarClock, featured: true },
    { key: 'sameDay', rule: sameDay, icon: Zap, featured: false },
  ] as const;

  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">{t('eyebrow')}</p>
          <h2 id="pricing-heading" className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-3 text-lg text-brand-ink/65">{t('subtitle')}</p>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {plans.map(({ key, rule, icon: Icon, featured }, index) => (
            <Reveal key={key} delay={index * 100}>
              <article
                className={`relative flex h-full flex-col gap-5 rounded-3xl border p-5 transition-shadow hover:shadow-xl sm:p-8 ${
                  featured ? 'border-brand-route bg-brand-route-deep text-brand-paper shadow-lg' : 'border-brand-ink/10 bg-brand-paper text-brand-ink'
                }`}
              >
                {featured ? (
                  <span className="absolute inset-e-6 top-6 rounded-full bg-brand-signal px-3 py-1 text-xs font-semibold text-brand-route-deep">
                    {t('bestValue')}
                  </span>
                ) : null}
                <span className={`flex size-12 items-center justify-center rounded-2xl ${featured ? 'bg-brand-paper/10' : 'bg-brand-route/10 text-brand-route'}`}>
                  <Icon className="size-6" aria-hidden />
                </span>
                <div>
                  <h3 className="font-display text-2xl font-semibold">{t(`plans.${key}.name`)}</h3>
                  <p className={featured ? 'text-brand-paper/70' : 'text-brand-ink/60'}>{t(`plans.${key}.tagline`)}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-display text-3xl font-semibold sm:text-4xl">{money(rule, rule.basePrice)}</p>
                    <p className={`text-sm ${featured ? 'text-brand-paper/70' : 'text-brand-ink/60'}`}>
                      {t('firstDistance', { distance: format.km(rule.baseDistanceKm, 0) })}
                    </p>
                  </div>
                  <div>
                    <p className="font-display text-3xl font-semibold sm:text-4xl">+{money(rule, rule.additionalPricePerKm)}</p>
                    <p className={`text-sm ${featured ? 'text-brand-paper/70' : 'text-brand-ink/60'}`}>{t('perExtraKm')}</p>
                  </div>
                </div>
                <ul className={`flex flex-col gap-2 text-sm ${featured ? 'text-brand-paper/85' : 'text-brand-ink/75'}`}>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-signal" aria-hidden />
                    {t('includedWeight', { weight: format.kg(rule.includedWeightKg) })}
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-signal" aria-hidden />
                    {t('trackingFeature')}
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-signal" aria-hidden />
                    {t('range', { distance: format.km(rule.maxDistanceKm, 0) })}
                  </li>
                </ul>
                <Button
                  asChild
                  size="lg"
                  className={`mt-auto ${featured ? 'bg-brand-signal text-brand-route-deep hover:bg-brand-signal/90' : 'bg-brand-route text-brand-paper hover:bg-brand-route/90'}`}
                >
                  <Link href={localizeHref('/register', locale)}>
                    {t(`plans.${key}.cta`)}
                    <ArrowRight className="rtl:rotate-180" aria-hidden />
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
            <h3 className="font-display text-xl font-semibold text-brand-ink">{t('heavier.title')}</h3>
            <div className="grid grid-cols-2 gap-4 text-brand-ink">
              <div>
                <p className="font-display text-3xl font-semibold">{format.kg(sameDay.includedWeightKg)}</p>
                <p className="text-sm text-brand-ink/60">{t('heavier.included')}</p>
              </div>
              <div>
                <p className="font-display text-3xl font-semibold">+{money(sameDay, sameDay.additionalPricePerKg)}</p>
                <p className="text-sm text-brand-ink/60">{t('heavier.perKg', { weight: format.kg(sameDay.includedWeightKg) })}</p>
              </div>
            </div>
            <p className="text-sm text-brand-ink/60">{t('heavier.note')}</p>
            <div className="mt-auto flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-brand-ink/75">
              <Building2 className="mt-0.5 size-5 shrink-0 text-brand-route" aria-hidden />
              <p>
                <span className="font-semibold text-brand-ink">{t('merchantLead')}</span> {t('merchantBody')}{' '}
                <Link href={localizeHref('/#merchants', locale)} className="font-semibold text-brand-route hover:underline">
                  {t('merchantLink')}
                </Link>
              </p>
            </div>
          </div>
          <div className="lg:col-span-3">
            <h3 className="sr-only">{t('calculatorHeading')}</h3>
            <FareCalculator rules={rules} className="h-full" />
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default PricingSection;
