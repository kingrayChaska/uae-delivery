import { BadgeCheck, MapPin, PackagePlus, Truck } from 'lucide-react';

import Reveal from '@/components/marketing/reveal';

const STEPS = [
  {
    icon: MapPin,
    title: 'Add your shipments',
    description: 'Enter pickup and delivery addresses. Sending several parcels? Add them all to one booking.',
  },
  {
    icon: PackagePlus,
    title: 'Pick a service, see the price',
    description: 'Choose same-day or next-day. The price is calculated from the real road distance and weight before you pay.',
  },
  {
    icon: Truck,
    title: 'We collect and deliver',
    description: 'A ParcelLink driver picks up from your door and heads straight to the recipient.',
  },
  {
    icon: BadgeCheck,
    title: 'Track it, get proof',
    description: 'Follow each step with your tracking ID, then view the photo, signature or code that confirms delivery.',
  },
];

const HowItWorks = () => {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">How it works</p>
          <h2 id="how-heading" className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            From booking to proof of delivery in four steps
          </h2>
        </Reveal>

        <ol className="relative mt-12 grid gap-8 md:grid-cols-4 md:gap-6">
          <div
            aria-hidden
            className="absolute left-6 right-6 top-6 hidden h-px bg-[repeating-linear-gradient(90deg,var(--brand-route)_0_8px,transparent_8px_16px)] md:block"
          />
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <Reveal as="li" key={step.title} delay={index * 110} className="relative flex gap-4 md:flex-col">
                <div className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-route text-brand-paper shadow-lg shadow-brand-route/25">
                  <Icon className="size-5" aria-hidden />
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="font-brand-mono text-xs text-brand-ink/50">Step {index + 1}</p>
                  <h3 className="font-display text-lg font-semibold text-brand-ink">{step.title}</h3>
                  <p className="text-brand-ink/65">{step.description}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
};

export default HowItWorks;
