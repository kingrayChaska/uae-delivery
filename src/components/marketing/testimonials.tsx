import { getTranslations } from 'next-intl/server';

import Reveal from '@/components/marketing/reveal';
import TestimonialCarousel from '@/components/marketing/testimonial-carousel';
import { TESTIMONIALS, localizedText, visibleTestimonials } from '@/lib/marketing/testimonials';
import { getFormat, getRequestLocale } from '@/i18n/server';

// Renders nothing until there's something honest to show: in production,
// only real testimonials count (see lib/marketing/testimonials.ts).
const Testimonials = async () => {
  const testimonials = visibleTestimonials(TESTIMONIALS);
  if (testimonials.length === 0) return null;

  const [t, locale, format] = await Promise.all([getTranslations('marketing.testimonials'), getRequestLocale(), getFormat()]);
  const real = testimonials.filter((testimonial) => !testimonial.sample);
  const average = real.length ? real.reduce((sum, item) => sum + item.rating, 0) / real.length : null;
  const showingSamples = real.length < testimonials.length;
  // The carousel gets text already in the page's language.
  const slides = testimonials.map((testimonial) => ({
    id: testimonial.id,
    quote: localizedText(testimonial.quote, locale),
    name: testimonial.name,
    role: localizedText(testimonial.role, locale),
    location: localizedText(testimonial.location, locale),
    rating: testimonial.rating,
    service: t(`services.${testimonial.service}`),
    sample: testimonial.sample,
  }));

  return (
    <section id="testimonials" aria-labelledby="testimonials-heading" className="overflow-hidden bg-brand-paper py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">{t('eyebrow')}</p>
            <h2 id="testimonials-heading" className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
              {t('title')}
            </h2>
          </div>
          {average !== null ? (
            <p className="text-brand-ink/70">
              {t.rich('average', {
                average: format.number(average, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
                count: real.length,
                strong: (chunks) => <span className="font-display text-2xl font-semibold text-brand-ink">{chunks}</span>,
              })}
            </p>
          ) : null}
        </Reveal>

        {showingSamples ? (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            {t.rich('devNotice', { code: (chunks) => <code className="font-brand-mono">{chunks}</code> })}
          </p>
        ) : null}

        <Reveal className="mt-10">
          <TestimonialCarousel testimonials={slides} />
        </Reveal>
      </div>
    </section>
  );
};

export default Testimonials;
