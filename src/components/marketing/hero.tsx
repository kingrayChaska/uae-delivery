import Link from 'next/link';
import { ArrowRight, BadgeCheck, CalendarClock, PackageSearch, Zap } from 'lucide-react';

import Button from '@/components/ui/button';
import RouteMapGraphic from '@/components/marketing/route-map-graphic';
import HeroAnimation from '@/components/marketing/hero-animation';

import type { PricingRule } from '@/lib/types';

// Entrance motion is pure CSS (tw-animate-css), so the text is in the HTML
// from the start; motion-reduce turns it off.
const enter = 'animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both motion-reduce:animate-none';

const Hero = ({ nextDay }: { nextDay: PricingRule }) => {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden bg-brand-route-deep">
      {/* Soft brand glow behind the headline */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-40 size-144 rounded-full bg-brand-route/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 right-0 size-120 rounded-full bg-brand-signal/20 blur-3xl"
      />

      <HeroAnimation />

      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2 lg:py-28">
        <div className="flex flex-col gap-6">
          <p className={`${enter} inline-flex w-fit items-center gap-2 rounded-full border border-brand-paper/15 bg-brand-paper/5 px-3 py-1.5 text-sm text-brand-paper/80`}>
            <span className="size-2 rounded-full bg-brand-signal" aria-hidden />
            Parcel delivery across the UAE
          </p>
          <h1
            id="hero-heading"
            className={`${enter} delay-100 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-brand-paper sm:text-5xl lg:text-[3.5rem]`}
          >
            Same-day and next-day courier service, <span className="text-brand-signal">tracked door to door</span>
          </h1>
          <p className={`${enter} delay-200 max-w-xl text-lg text-brand-paper/75`}>
            Book a pickup in minutes, see the price before you confirm, and follow every parcel live — for personal
            deliveries and for businesses shipping every day.
          </p>

          <div className={`${enter} delay-300 flex flex-col gap-3 pt-2 sm:flex-row`}>
            <Button asChild size="lg" className="bg-brand-signal text-brand-route-deep hover:bg-brand-signal/90 hover:shadow-brand-signal/30">
              <Link href="/register">
                Book a delivery
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-brand-paper/25 bg-transparent text-brand-paper hover:border-brand-paper/50 hover:bg-brand-paper/10 hover:text-brand-paper"
            >
              <Link href="/tracking">
                <PackageSearch aria-hidden />
                Track a shipment
              </Link>
            </Button>
          </div>

          <ul className={`${enter} delay-500 grid gap-3 pt-4 text-sm text-brand-paper/80 sm:grid-cols-3`}>
            <li className="flex items-center gap-2">
              <CalendarClock className="size-4 text-brand-signal" aria-hidden />
              Next-day from {nextDay.currency} {nextDay.basePrice.toFixed(0)}
            </li>
            <li className="flex items-center gap-2">
              <Zap className="size-4 text-brand-signal" aria-hidden />
              Same-day delivery
            </li>
            <li className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-brand-signal" aria-hidden />
              Proof of delivery
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
