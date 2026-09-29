import { getTranslations } from 'next-intl/server';

import SiteFooter from '@/components/marketing/site-footer';
import SiteNav from '@/components/marketing/site-nav';
import TrackingLookupForm from '@/components/shipment/tracking-lookup-form';
import { OG_LOCALES } from '@/i18n/config';
import { getRequestLocale } from '@/i18n/server';
import { localizedAlternates } from '@/lib/seo';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => {
  const [t, locale] = await Promise.all([getTranslations('tracking.meta'), getRequestLocale()]);
  const alternates = localizedAlternates('/tracking', locale);
  return {
    title: t('title'),
    description: t('description'),
    alternates,
    openGraph: { url: alternates.canonical, title: t('ogTitle'), locale: OG_LOCALES[locale] },
  };
};

const TrackingPage = async () => {
  const t = await getTranslations('tracking.page');

  return (
    <>
      <SiteNav />
      <main className="flex flex-1 flex-col items-center gap-8 bg-brand-paper px-4 py-16 sm:px-6 md:py-24">
        <div className="flex max-w-xl flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">{t('eyebrow')}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">{t('title')}</h1>
          <p className="text-brand-ink/65">{t('subtitle')}</p>
        </div>
        <TrackingLookupForm />
      </main>
      <SiteFooter />
    </>
  );
};

export default TrackingPage;
