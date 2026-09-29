import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import Reveal from '@/components/marketing/reveal';
import TrackingTimeline from '@/components/shipment/tracking-timeline';
import { getTrackingMilestones } from '@/lib/shipment/tracking-milestones';
import { localizeHref } from '@/i18n/config';
import { getRequestLocale } from '@/i18n/server';

// Demonstration only: the same timeline customers see, frozen mid-journey.
const DEMO_MILESTONES = getTrackingMilestones('in_transit');

const LiveTrackingDemo = async () => {
  const [t, locale] = await Promise.all([getTranslations('marketing.trackingDemo'), getRequestLocale()]);

  return (
    <section id="tracking" aria-labelledby="tracking-heading" className="relative overflow-hidden bg-brand-route-deep py-20 md:py-28">
      <div aria-hidden className="pointer-events-none absolute -inset-e-40 top-10 size-112 rounded-full bg-brand-route/40 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal className="flex flex-col gap-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-signal">{t('eyebrow')}</p>
          <h2 id="tracking-heading" className="font-display text-3xl font-semibold tracking-tight text-brand-paper md:text-4xl">
            {t('title')}
          </h2>
          <p className="max-w-md text-lg text-brand-paper/70">{t('subtitle')}</p>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-fit border-brand-paper/25 bg-transparent text-brand-paper hover:border-brand-paper/50 hover:bg-brand-paper/10 hover:text-brand-paper"
          >
            <Link href={localizeHref('/tracking', locale)}>
              {t('cta')}
              <ArrowRight className="rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
        </Reveal>

        <Reveal delay={120} className="rounded-3xl border border-brand-paper/10 bg-brand-paper/5 p-6 backdrop-blur sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-brand-paper/60">
              {t('trackingId')}{' '}
              <span dir="ltr" className="rounded-md bg-brand-paper/10 px-2 py-1 font-brand-mono font-semibold tracking-[0.18em] text-brand-paper">
                PL7K29X4
              </span>
            </p>
            <span className="rounded-full bg-brand-signal/20 px-3 py-1 text-xs font-semibold text-brand-signal">{t('inTransit')}</span>
          </div>
          <TrackingTimeline milestones={DEMO_MILESTONES} dark />
        </Reveal>
      </div>
    </section>
  );
};

export default LiveTrackingDemo;
