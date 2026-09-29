import SiteFooter from '@/components/marketing/site-footer';
import SiteNav from '@/components/marketing/site-nav';
import TrackingLookupForm from '@/components/shipment/tracking-lookup-form';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Track a Shipment — ParcelLink Parcel Tracking UAE',
  description:
    'Track your ParcelLink parcel with its tracking ID. See every step from booking to delivery, anywhere in the UAE.',
  alternates: { canonical: '/tracking' },
  openGraph: { url: '/tracking', title: 'Track a Shipment — ParcelLink' },
};

const TrackingPage = () => {
  return (
    <>
      <SiteNav />
      <main className="flex flex-1 flex-col items-center gap-8 bg-brand-paper px-4 py-16 sm:px-6 md:py-24">
        <div className="flex max-w-xl flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">Shipment tracking</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">Track a shipment</h1>
          <p className="text-brand-ink/65">
            Enter the tracking ID from your booking confirmation or label. Capital letters and spaces don’t matter.
          </p>
        </div>
        <TrackingLookupForm />
      </main>
      <SiteFooter />
    </>
  );
};

export default TrackingPage;
