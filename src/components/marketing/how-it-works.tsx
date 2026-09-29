import { BadgeCheck, MapPin, PackagePlus, Truck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Reveal from '@/components/marketing/reveal';

const STEPS = [
  { key: 'add', icon: MapPin },
  { key: 'price', icon: PackagePlus },
  { key: 'deliver', icon: Truck },
  { key: 'proof', icon: BadgeCheck },
] as const;

const HowItWorks = async () => {
  const t = await getTranslations('marketing.howItWorks');

  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">{t('eyebrow')}</p>
          <h2 id="how-heading" className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            {t('title')}
          </h2>
        </Reveal>

        <ol className="relative mt-12 grid gap-8 md:grid-cols-4 md:gap-6">
          <div
            aria-hidden
            className="absolute inset-x-6 top-6 hidden h-px bg-[repeating-linear-gradient(90deg,var(--brand-route)_0_8px,transparent_8px_16px)] md:block"
          />
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <Reveal as="li" key={step.key} delay={index * 110} className="relative flex gap-4 md:flex-col">
                <div className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-route text-brand-paper shadow-lg shadow-brand-route/25">
                  <Icon className="size-5" aria-hidden />
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="font-brand-mono text-xs text-brand-ink/50">{t('step', { number: index + 1 })}</p>
                  <h3 className="font-display text-lg font-semibold text-brand-ink">{t(`steps.${step.key}.title`)}</h3>
                  <p className="text-brand-ink/65">{t(`steps.${step.key}.description`)}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
};

export default HowItWorks;
