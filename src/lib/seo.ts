import { getPublicOrigin } from '@/lib/auth/public-url';

// Single source for the site's search/social metadata.
export const SITE_NAME = 'ParcelLink';

export const SITE_TITLE = 'ParcelLink — Parcel Delivery & Courier Service in the UAE';

export const SITE_DESCRIPTION =
  'Book same-day and next-day parcel delivery across the UAE with upfront pricing, live shipment tracking, proof of delivery, cash on delivery and merchant logistics for businesses.';

export const SITE_KEYWORDS = [
  'parcel delivery UAE',
  'courier service UAE',
  'same-day delivery UAE',
  'next-day delivery UAE',
  'business logistics UAE',
  'merchant delivery',
  'cash on delivery UAE',
  'shipment tracking UAE',
  'Dubai courier',
];

// No trailing slash, so `${siteUrl()}/tracking` never becomes "//tracking"
// when NEXT_PUBLIC_APP_URL is configured with one.
export const siteUrl = () => getPublicOrigin().replace(/\/+$/, '');

// Public, indexable pages (everything else is behind sign-in or is an auth flow).
export const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/tracking', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/register', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/login', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
];
