import Link from 'next/link';
import { ArrowRight, PackageSearch } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import Reveal from '@/components/marketing/reveal';
import { localizeHref } from '@/i18n/config';
import { getRequestLocale } from '@/i18n/server';

const FinalCta = async () => {
  const [t, locale] = await Promise.all([getTranslations('marketing.finalCta'), getRequestLocale()]);

  return (
    <section aria-labelledby="cta-heading" className="bg-brand-paper px-4 pb-20 sm:px-6 md:pb-28">
      <Reveal className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 overflow-hidden rounded-3xl bg-brand-route-deep p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
        <div aria-hidden className="pointer-events-none absolute -inset-e-20 -top-20 size-80 rounded-full bg-brand-signal/25 blur-3xl" />
        <div className="relative flex flex-col gap-2">
          <h2 id="cta-heading" className="font-display text-3xl font-semibold tracking-tight text-brand-paper md:text-4xl">
            {t('title')}
          </h2>
          <p className="text-brand-paper/70">{t('subtitle')}</p>
        </div>
        <div className="relative flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg" className="bg-brand-signal text-brand-route-deep hover:bg-brand-signal/90">
            <Link href={localizeHref('/register', locale)}>
              {t('book')}
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
              {t('track')}
            </Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
};

export default FinalCta;
