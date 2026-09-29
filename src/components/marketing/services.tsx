import Link from 'next/link';
import { ArrowRight, Banknote, BadgeCheck, Building2, CalendarClock, MapPinned, Zap } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Reveal from '@/components/marketing/reveal';
import { localizeHref } from '@/i18n/config';
import { getRequestLocale } from '@/i18n/server';

import type { LucideIcon } from 'lucide-react';

type Service = {
  key: 'sameDay' | 'nextDay' | 'merchant' | 'cod' | 'tracking' | 'proof';
  icon: LucideIcon;
  href: string;
};

const SERVICES: Service[] = [
  { key: 'sameDay', icon: Zap, href: '/register' },
  { key: 'nextDay', icon: CalendarClock, href: '/#pricing' },
  { key: 'merchant', icon: Building2, href: '/#merchants' },
  { key: 'cod', icon: Banknote, href: '/#merchants' },
  { key: 'tracking', icon: MapPinned, href: '/tracking' },
  { key: 'proof', icon: BadgeCheck, href: '/#how-it-works' },
];

const Services = async () => {
  const [t, locale] = await Promise.all([getTranslations('marketing.services'), getRequestLocale()]);

  return (
    <section id="services" aria-labelledby="services-heading" className="bg-brand-paper py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">{t('eyebrow')}</p>
          <h2 id="services-heading" className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-3 text-lg text-brand-ink/65">{t('subtitle')}</p>
        </Reveal>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service, index) => {
            const Icon = service.icon;
            return (
              <Reveal as="li" key={service.key} delay={(index % 3) * 90}>
                <article className="group flex h-full flex-col gap-4 rounded-2xl border border-brand-ink/10 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-route/30 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-route/10 text-brand-route transition-colors group-hover:bg-brand-route group-hover:text-brand-paper">
                    <Icon className="size-6" strokeWidth={1.75} aria-hidden />
                  </span>
                  <h3 className="font-display text-xl font-semibold text-brand-ink">{t(`items.${service.key}.name`)}</h3>
                  <p className="flex-1 text-brand-ink/65">{t(`items.${service.key}.description`)}</p>
                  <Link
                    href={localizeHref(service.href, locale)}
                    className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand-route hover:underline focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none"
                  >
                    {t(`items.${service.key}.cta`)}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </article>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default Services;
