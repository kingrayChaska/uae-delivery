import Link from 'next/link';

import Button from '@/components/ui/button';
import RouteMapGraphic from '@/components/marketing/route-map-graphic';

const Hero = () => {
  return (
    <section className="bg-brand-route-deep">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2 md:py-28">
        <div className="flex flex-col gap-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.1] text-brand-paper md:text-5xl">
            Reliable delivery across the UAE
          </h1>
          <p className="max-w-md text-lg text-brand-paper/70">
            Book a pickup, watch it move in real time, and get it there — same day, next day, or
            on a schedule your business can plan around.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg" className="bg-brand-signal text-brand-route-deep hover:bg-brand-signal/90">
              <Link href="/register">Book a Delivery</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-brand-paper/30 bg-transparent text-brand-paper hover:bg-brand-paper/10"
            >
              <Link href="/tracking">Track a Shipment</Link>
            </Button>
          </div>
        </div>

        <RouteMapGraphic />
      </div>
    </section>
  );
};

export default Hero;
