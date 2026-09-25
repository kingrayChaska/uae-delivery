import { Banknote, Boxes, Building2, CalendarClock, ShoppingBag, Zap } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

type Service = {
  icon: LucideIcon;
  name: string;
  description: string;
  featured?: boolean;
};

const SERVICES: Service[] = [
  {
    icon: Zap,
    name: 'Same-Day Delivery',
    description:
      'Book before the cutoff and it moves today — the fastest way to get something across town.',
    featured: true,
  },
  {
    icon: CalendarClock,
    name: 'Next-Day Delivery',
    description: 'Schedule ahead and pay less for deliveries that can wait until tomorrow.',
  },
  {
    icon: ShoppingBag,
    name: 'E-commerce Delivery',
    description: 'Plug your storefront into a delivery network built for online order volume.',
  },
  {
    icon: Building2,
    name: 'Business Delivery',
    description: 'Recurring pickups, dedicated support, and a single account for every shipment.',
  },
  {
    icon: Banknote,
    name: 'COD Delivery',
    description: 'Collect payment on arrival, with every collection tracked and reconciled.',
  },
  {
    icon: Boxes,
    name: 'Bulk Shipments',
    description: 'Move many parcels in one booking, priced and dispatched together.',
  },
];

const Services = () => {
  return (
    <section id="services" className="bg-brand-paper py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-lg">
          <h2 className="font-display text-3xl font-semibold text-brand-ink md:text-4xl">
            One network, every kind of delivery
          </h2>
          <p className="mt-3 text-brand-ink/65">
            Pick the service that matches how fast it needs to move.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            return (
              <div
                key={service.name}
                className={`flex flex-col gap-3 rounded border-l-4 border-brand-route bg-white p-6 ${
                  service.featured ? 'md:col-span-2 md:row-span-1' : ''
                }`}
              >
                <Icon className="size-6 text-brand-route" strokeWidth={1.75} />
                <h3 className="font-display text-lg font-medium text-brand-ink">{service.name}</h3>
                <p className="text-sm text-brand-ink/65">{service.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Services;
