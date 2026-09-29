import Reveal from '@/components/marketing/reveal';
import TestimonialCarousel from '@/components/marketing/testimonial-carousel';
import { TESTIMONIALS, visibleTestimonials } from '@/lib/marketing/testimonials';

// Renders nothing until there's something honest to show: in production,
// only real testimonials count (see lib/marketing/testimonials.ts).
const Testimonials = () => {
  const testimonials = visibleTestimonials(TESTIMONIALS);
  if (testimonials.length === 0) return null;

  const real = testimonials.filter((testimonial) => !testimonial.sample);
  const average = real.length ? real.reduce((sum, t) => sum + t.rating, 0) / real.length : null;
  const showingSamples = real.length < testimonials.length;

  return (
    <section id="testimonials" aria-labelledby="testimonials-heading" className="overflow-hidden bg-brand-paper py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">Customer reviews</p>
            <h2 id="testimonials-heading" className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
              What senders say about ParcelLink
            </h2>
          </div>
          {average !== null ? (
            <p className="text-brand-ink/70">
              <span className="font-display text-2xl font-semibold text-brand-ink">{average.toFixed(1)}</span> / 5 average from{' '}
              {real.length} {real.length === 1 ? 'review' : 'reviews'}
            </p>
          ) : null}
        </Reveal>

        {showingSamples ? (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            Development preview: sample testimonials are shown here and hidden in production. Replace them with real customer
            reviews in <code className="font-brand-mono">src/lib/marketing/testimonials.ts</code>.
          </p>
        ) : null}

        <Reveal className="mt-10">
          <TestimonialCarousel testimonials={testimonials} />
        </Reveal>
      </div>
    </section>
  );
};

export default Testimonials;
