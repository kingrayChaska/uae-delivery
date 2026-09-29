'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Quote, Star } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { Testimonial } from '@/lib/marketing/testimonials';

const AUTOPLAY_MS = 6500;

const Stars = ({ rating }: { rating: number }) => (
  <div className="flex gap-0.5" role="img" aria-label={`Rated ${rating} out of 5`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        className={cn('size-4', star <= rating ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-brand-ink/20')}
        aria-hidden
      />
    ))}
  </div>
);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

// Native horizontal scroll with snap points: swipe works on touch screens
// with no library, and the page stays usable without JavaScript. The
// buttons, dots and autoplay just scroll the same track.
const TestimonialCarousel = ({ testimonials }: { testimonials: Testimonial[] }) => {
  const trackRef = useRef<HTMLUListElement>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(testimonials.length);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useRef(false);

  // Width of one slide plus the gap, and how many fit on screen.
  const measure = useCallback(() => {
    const track = trackRef.current;
    const first = track?.firstElementChild as HTMLElement | null;
    if (!track || !first) return { step: 1, perView: 1 };
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = first.offsetWidth + gap;
    return { step, perView: Math.max(1, Math.round((track.clientWidth + gap) / step)) };
  }, []);

  const sync = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const { step, perView } = measure();
    const pages = Math.max(1, testimonials.length - perView + 1);
    setPageCount(pages);
    setPage(Math.min(pages - 1, Math.round(track.scrollLeft / step)));
  }, [measure, testimonials.length]);

  const goTo = useCallback(
    (target: number) => {
      const track = trackRef.current;
      if (!track) return;
      const { step, perView } = measure();
      const pages = Math.max(1, testimonials.length - perView + 1);
      const wrapped = (target + pages) % pages;
      track.scrollTo({ left: wrapped * step, behavior: reducedMotion.current ? 'auto' : 'smooth' });
    },
    [measure, testimonials.length],
  );

  // Autoplay only for people who haven't asked for reduced motion.
  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = requestAnimationFrame(() => {
      sync();
      setPlaying(!reducedMotion.current);
    });
    window.addEventListener('resize', sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', sync);
    };
  }, [sync]);

  // Pauses while the pointer or keyboard focus is on the carousel, and while
  // the tab is in the background.
  const paused = !playing || hovered || focused;
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') goTo(page + 1);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [paused, page, goTo]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(page + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(page - 1);
    }
  };

  const navButton =
    'flex size-11 items-center justify-center rounded-full border border-brand-ink/15 bg-white text-brand-ink shadow-sm transition-all duration-150 hover:border-brand-route/40 hover:text-brand-route active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none motion-reduce:transition-none';

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Customer testimonials"
      className="flex flex-col gap-6"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={onKeyDown}
    >
      <ul
        ref={trackRef}
        onScroll={sync}
        aria-live={paused ? 'polite' : 'off'}
        className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-4 px-4 pb-4 scrollbar-none sm:-mx-6 sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {testimonials.map((testimonial, index) => (
          <li
            key={testimonial.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${testimonials.length}`}
            className="flex w-[86%] shrink-0 snap-start sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.834rem)]"
          >
            <figure className="relative flex w-full flex-col gap-5 rounded-3xl border border-brand-ink/10 bg-white p-6 shadow-sm transition-shadow duration-200 hover:shadow-lg sm:p-7">
              <Quote className="absolute right-6 top-6 size-8 text-brand-route/15" aria-hidden />
              <div className="flex flex-wrap items-center gap-3 pr-10">
                <Stars rating={testimonial.rating} />
                <span className="rounded-full bg-brand-route/10 px-2.5 py-0.5 text-xs font-medium text-brand-route">
                  {testimonial.service}
                </span>
                {testimonial.sample ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Sample</span>
                ) : null}
              </div>
              <blockquote className="flex-1 text-brand-ink/80">
                <p>“{testimonial.quote}”</p>
              </blockquote>
              <figcaption className="flex items-center gap-3 border-t border-brand-ink/10 pt-5">
                <span
                  aria-hidden
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-route-deep font-display text-sm font-semibold text-brand-paper"
                >
                  {initials(testimonial.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-brand-ink">{testimonial.name}</span>
                  <span className="block truncate text-sm text-brand-ink/60">
                    {testimonial.role} · {testimonial.location}
                  </span>
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Show testimonial ${index + 1}`}
              aria-current={index === page ? 'true' : undefined}
              className="flex size-8 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none"
            >
              <span
                className={cn(
                  'h-2 rounded-full transition-all duration-300 motion-reduce:transition-none',
                  index === page ? 'w-6 bg-brand-route' : 'w-2 bg-brand-ink/20 hover:bg-brand-ink/40',
                )}
              />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? 'Pause automatic scrolling' : 'Play automatic scrolling'}
            className={navButton}
          >
            {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          </button>
          <button type="button" onClick={() => goTo(page - 1)} aria-label="Previous testimonial" className={navButton}>
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={() => goTo(page + 1)} aria-label="Next testimonial" className={navButton}>
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TestimonialCarousel;
