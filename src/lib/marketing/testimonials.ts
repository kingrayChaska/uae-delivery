// Customer testimonials for the landing page.
//
// Only publish testimonials real customers actually gave you, with their
// permission to show their name. Entries marked `sample: true` are
// placeholders for designing the section: they're shown in development and
// automatically hidden in production, so invented reviews can never reach
// real visitors. To go live, add real entries (sample: false) and delete the
// samples. The section stays hidden in production until at least one real
// testimonial exists.

export type Testimonial = {
  id: string;
  quote: string;
  name: string;
  // e.g. "Online boutique owner" or "Individual customer"
  role: string;
  location: string;
  // Whole stars, 1–5.
  rating: 1 | 2 | 3 | 4 | 5;
  service: 'Same-day' | 'Next-day' | 'Merchant' | 'Cash on delivery';
  sample: boolean;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    id: 'sample-1',
    quote:
      'I booked a same-day pickup at lunchtime and the documents were in Business Bay before 5pm. The tracking ID made it easy to share with the recipient.',
    name: 'Sample customer',
    role: 'Individual customer',
    location: 'Dubai Marina',
    rating: 5,
    service: 'Same-day',
    sample: true,
  },
  {
    id: 'sample-2',
    quote:
      'We send around 40 orders a week. Adding them all to one booking and seeing the total up front saves our team a lot of back and forth.',
    name: 'Sample merchant',
    role: 'Online store owner',
    location: 'Al Quoz',
    rating: 5,
    service: 'Merchant',
    sample: true,
  },
  {
    id: 'sample-3',
    quote:
      'Cash on delivery is collected and recorded properly, so reconciling at the end of the week is simple.',
    name: 'Sample merchant',
    role: 'Electronics retailer',
    location: 'Deira',
    rating: 4,
    service: 'Cash on delivery',
    sample: true,
  },
  {
    id: 'sample-4',
    quote:
      'Next-day delivery is great value for parcels that aren’t urgent, and the proof-of-delivery photo gave me peace of mind.',
    name: 'Sample customer',
    role: 'Individual customer',
    location: 'Jumeirah',
    rating: 5,
    service: 'Next-day',
    sample: true,
  },
  {
    id: 'sample-5',
    quote:
      'Our villa wasn’t on the map search, so I dropped a pin and added the gate number. The driver came straight to the door.',
    name: 'Sample customer',
    role: 'Individual customer',
    location: 'Arabian Ranches',
    rating: 5,
    service: 'Same-day',
    sample: true,
  },
];

// Real testimonials always show; samples only outside production.
export const visibleTestimonials = (all: Testimonial[] = TESTIMONIALS, isProduction = process.env.NODE_ENV === 'production') =>
  all.filter((testimonial) => !testimonial.sample || !isProduction);
