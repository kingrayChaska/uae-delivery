import Link from 'next/link';
import { ArrowRight, Banknote, BadgeCheck, Building2, CalendarClock, MapPinned, Zap } from 'lucide-react';

import Reveal from '@/components/marketing/reveal';

import type { LucideIcon } from 'lucide-react';

type Service = {
  icon: LucideIcon;
  name: string;
  description: string;
  href: string;
  cta: string;
};

const SERVICES: Service[] = [
  {
    icon: Zap,
    name: 'Same-day delivery',
    description: 'Collected and delivered on the same day — for documents, gifts and anything that can’t wait.',
    href: '/register',
    cta: 'Book same-day',
  },
  {
    icon: CalendarClock,
    name: 'Next-day delivery',
    description: 'Our best price for parcels that can arrive tomorrow. Book today, delivered the next day.',
    href: '/#pricing',
    cta: 'See next-day pricing',
  },
  {
    icon: Building2,
    name: 'Merchant logistics',
    description: 'Flat-rate pricing, multi-shipment bookings and one account for every order your business ships.',
    href: '/#merchants',
    cta: 'Ship as a merchant',
  },
  {
    icon: Banknote,
    name: 'Cash on delivery',
    description: 'We collect the payment for your goods from the recipient, recorded and reconciled for you.',
    href: '/#merchants',
    cta: 'How COD works',
  },
  {
    icon: MapPinned,
    name: 'Shipment tracking',
    description: 'Every parcel gets a short tracking ID and live status from booking to delivery.',
    href: '/tracking',
    cta: 'Track a shipment',
  },
  {
    icon: BadgeCheck,
    name: 'Proof of delivery',
    description: 'Photo, signature, recipient code or label scan — see exactly how and when it was delivered.',
    href: '/#how-it-works',
    cta: 'See how it works',
  },
];

const Services = () => {
  return (
    <section id="services" aria-labelledby="services-heading" className="bg-brand-paper py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">Services</p>
          <h2 id="services-heading" className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            Parcel delivery for people and businesses across the UAE
          </h2>
          <p className="mt-3 text-lg text-brand-ink/65">
            One courier network for a single envelope or a warehouse full of orders — booked, priced and tracked online.
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service, index) => {
            const Icon = service.icon;
            return (
              <Reveal as="li" key={service.name} delay={(index % 3) * 90}>
                <article className="group flex h-full flex-col gap-4 rounded-2xl border border-brand-ink/10 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-route/30 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-route/10 text-brand-route transition-colors group-hover:bg-brand-route group-hover:text-brand-paper">
                    <Icon className="size-6" strokeWidth={1.75} aria-hidden />
                  </span>
                  <h3 className="font-display text-xl font-semibold text-brand-ink">{service.name}</h3>
                  <p className="flex-1 text-brand-ink/65">{service.description}</p>
                  <Link
                    href={service.href}
                    className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand-route hover:underline focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none"
                  >
                    {service.cta}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
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
