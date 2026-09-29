import Link from 'next/link';
import { ArrowRight, Banknote, BarChart3, Boxes, Check, FileCheck2, Tag } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import Reveal from '@/components/marketing/reveal';
import { localizeHref } from '@/i18n/config';
import { getRequestLocale } from '@/i18n/server';

const BENEFITS = [
  { key: 'flatRate', icon: Tag },
  { key: 'oneBooking', icon: Boxes },
  { key: 'cod', icon: Banknote },
  { key: 'account', icon: BarChart3 },
] as const;

const STEPS = ['account', 'apply', 'review', 'ship'] as const;

const BusinessSolutions = async () => {
  const [t, locale] = await Promise.all([getTranslations('marketing.merchants'), getRequestLocale()]);

  return (
    <section id="merchants" aria-labelledby="merchants-heading" className="bg-brand-paper py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <Reveal className="flex flex-col gap-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">{t('eyebrow')}</p>
          <h2 id="merchants-heading" className="font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            {t('title')}
          </h2>
          <p className="text-lg text-brand-ink/65">{t('subtitle')}</p>

          <ol className="flex flex-col gap-3 rounded-3xl border border-brand-ink/10 bg-white p-5 sm:p-6">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-center gap-3 text-brand-ink/80">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-route/10 font-brand-mono text-sm font-semibold text-brand-route">
                  {index + 1}
                </span>
                {t(`steps.${step}`)}
              </li>
            ))}
          </ol>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-brand-route text-brand-paper hover:bg-brand-route/90">
              <Link href={localizeHref('/register', locale)}>
                {t('cta')}
                <ArrowRight className="rtl:rotate-180" aria-hidden />
              </Link>
            </Button>
          </div>
          <p className="flex items-center gap-2 text-sm text-brand-ink/55">
            <FileCheck2 className="size-4 shrink-0" aria-hidden />
            {t('licenceNote')}
          </p>
        </Reveal>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {BENEFITS.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <Reveal as="li" key={benefit.key} delay={index * 90}>
                <article className="flex h-full flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-signal/15 text-brand-signal">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="font-display text-lg font-semibold text-brand-ink">{t(`benefits.${benefit.key}.title`)}</h3>
                  <p className="text-brand-ink/65">{t(`benefits.${benefit.key}.description`)}</p>
                </article>
              </Reveal>
            );
          })}
          <Reveal as="li" className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <p className="flex items-start gap-2 rounded-2xl bg-brand-route/5 p-4 text-sm text-brand-ink/70">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-route" aria-hidden />
              {t('sameTracking')}
            </p>
          </Reveal>
        </ul>
      </div>
    </section>
  );
};

export default BusinessSolutions;
