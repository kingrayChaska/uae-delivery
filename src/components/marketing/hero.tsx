import Link from 'next/link';
import { ArrowRight, BadgeCheck, CalendarClock, PackageSearch, Zap } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import RouteMapGraphic from '@/components/marketing/route-map-graphic';
import HeroAnimation from '@/components/marketing/hero-animation';
import { localizeHref } from '@/i18n/config';
import { getFormat, getRequestLocale } from '@/i18n/server';

import type { PricingRule } from '@/lib/types';

// Entrance motion is pure CSS (tw-animate-css), so the text is in the HTML
// from the start; motion-reduce turns it off.
const enter = 'animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both motion-reduce:animate-none';

const Hero = async ({ nextDay }: { nextDay: PricingRule }) => {
  const [t, locale, format] = await Promise.all([getTranslations('marketing.hero'), getRequestLocale(), getFormat()]);

  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden bg-brand-route-deep">
      {/* Soft brand glow behind the headline */}
      <div
        aria-hidden
        className="pointer-events-none absolute -start-32 -top-40 size-144 rounded-full bg-brand-route/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 end-0 size-120 rounded-full bg-brand-signal/20 blur-3xl"
      />

      <HeroAnimation />

      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2 lg:py-28">
        <div className="flex flex-col gap-6">
          <p className={`${enter} inline-flex w-fit items-center gap-2 rounded-full border border-brand-paper/15 bg-brand-paper/5 px-3 py-1.5 text-sm text-brand-paper/80`}>
            <span className="size-2 rounded-full bg-brand-signal" aria-hidden />
            {t('badge')}
          </p>
          <h1
            id="hero-heading"
            className={`${enter} delay-100 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-brand-paper sm:text-5xl lg:text-[3.5rem] rtl:leading-[1.3]`}
          >
            {t.rich('title', { highlight: (chunks) => <span className="text-brand-signal">{chunks}</span> })}
          </h1>
          <p className={`${enter} delay-200 max-w-xl text-lg text-brand-paper/75`}>{t('subtitle')}</p>

          <div className={`${enter} delay-300 flex flex-col gap-3 pt-2 sm:flex-row`}>
            <Button asChild size="lg" className="bg-brand-signal text-brand-route-deep hover:bg-brand-signal/90 hover:shadow-brand-signal/30">
              <Link href={localizeHref('/register', locale)}>
                {t('bookCta')}
                <ArrowRight className="rtl:rotate-180" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-brand-paper/25 bg-transparent text-brand-paper hover:border-brand-paper/50 hover:bg-brand-paper/10 hover:text-brand-paper"
            >
              <Link href={localizeHref('/tracking', locale)}>
                <PackageSearch aria-hidden />
                {t('trackCta')}
              </Link>
            </Button>
          </div>

          <ul className={`${enter} delay-500 grid gap-3 pt-4 text-sm text-brand-paper/80 sm:grid-cols-3`}>
            <li className="flex items-center gap-2">
              <CalendarClock className="size-4 shrink-0 text-brand-signal" aria-hidden />
              {t('nextDayFrom', { price: `${nextDay.currency} ${format.number(nextDay.basePrice, { maximumFractionDigits: 0 })}` })}
            </li>
            <li className="flex items-center gap-2">
              <Zap className="size-4 shrink-0 text-brand-signal" aria-hidden />
              {t('sameDay')}
            </li>
            <li className="flex items-center gap-2">
              <BadgeCheck className="size-4 shrink-0 text-brand-signal" aria-hidden />
              {t('proof')}
            </li>
          </ul>
        </div>

        <div className={`${enter} delay-300 zoom-in-95`}>
          <RouteMapGraphic />
        </div>
      </div>
    </section>
  );
};

export default Hero;
