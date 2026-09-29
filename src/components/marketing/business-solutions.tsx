import Link from 'next/link';
import { ArrowRight, Banknote, BarChart3, Boxes, Check, FileCheck2, Tag } from 'lucide-react';

import Button from '@/components/ui/button';
import Reveal from '@/components/marketing/reveal';

const BENEFITS = [
  { icon: Tag, title: 'Flat-rate merchant pricing', description: 'One predictable price per shipment instead of distance-based rates.' },
  { icon: Boxes, title: 'Many shipments, one booking', description: 'Add every order to a single booking and see the total before you confirm.' },
  { icon: Banknote, title: 'Cash on delivery', description: 'We collect payment for your goods from the recipient and record every collection.' },
  { icon: BarChart3, title: 'One business account', description: 'All your shipments, billing and delivery history in one dashboard.' },
];

const STEPS = ['Create a free account', 'Apply as a merchant with your company details', 'Our team reviews and approves', 'Ship at merchant rates'];

const BusinessSolutions = () => {
  return (
    <section id="merchants" aria-labelledby="merchants-heading" className="bg-brand-paper py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <Reveal className="flex flex-col gap-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">For merchants</p>
          <h2 id="merchants-heading" className="font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            Business logistics for UAE merchants that ship every day
          </h2>
          <p className="text-lg text-brand-ink/65">
            From a single online store to a multi-branch operation: send regular and bulk shipments through one merchant
            account instead of chasing couriers order by order.
          </p>

          <ol className="flex flex-col gap-3 rounded-3xl border border-brand-ink/10 bg-white p-5 sm:p-6">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-center gap-3 text-brand-ink/80">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-route/10 font-brand-mono text-sm font-semibold text-brand-route">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-brand-route text-brand-paper hover:bg-brand-route/90">
              <Link href="/register">
                Apply for a merchant account
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <p className="flex items-center gap-2 text-sm text-brand-ink/55">
            <FileCheck2 className="size-4" aria-hidden />
            Have your trade licence details ready — every application is reviewed by our team.
          </p>
        </Reveal>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {BENEFITS.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <Reveal as="li" key={benefit.title} delay={index * 90}>
                <article className="flex h-full flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-signal/15 text-brand-signal">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="font-display text-lg font-semibold text-brand-ink">{benefit.title}</h3>
                  <p className="text-brand-ink/65">{benefit.description}</p>
                </article>
              </Reveal>
            );
          })}
          <Reveal as="li" className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <p className="flex items-start gap-2 rounded-2xl bg-brand-route/5 p-4 text-sm text-brand-ink/70">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-route" aria-hidden />
              Merchant shipments include the same tracking and proof of delivery as every ParcelLink delivery.
            </p>
          </Reveal>
        </ul>
      </div>
    </section>
  );
};

export default BusinessSolutions;
