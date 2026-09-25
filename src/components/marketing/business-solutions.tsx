import Link from 'next/link';

import Button from '@/components/ui/button';

const BENEFITS = [
  'Bulk deliveries, booked and priced together',
  'Cash on delivery, collected and reconciled',
  'One dashboard for every shipment',
  'Live tracking across your whole fleet of orders',
  'A dedicated business account with billing history',
  'Reporting on cost, volume and delivery performance',
  'A dedicated operations contact for your account',
];

const BusinessSolutions = () => {
  return (
    <section id="business" className="bg-brand-paper py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-3xl font-semibold text-brand-ink md:text-4xl">
            Built for businesses that ship every day
          </h2>
          <p className="max-w-md text-brand-ink/65">
            From a single storefront to a multi-branch operation, run your deliveries through one
            account instead of chasing couriers one order at a time.
          </p>
          <div className="pt-2">
            <Button asChild size="lg" className="bg-brand-route text-brand-paper hover:bg-brand-route/90">
              <Link href="/register">Partner With Us</Link>
            </Button>
          </div>
        </div>

        <ul className="flex flex-col gap-4">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-3">
              <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-signal" />
              <span className="text-brand-ink/80">{benefit}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default BusinessSolutions;
