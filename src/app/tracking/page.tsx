import SiteNav from '@/components/marketing/site-nav';
import TrackingLookupForm from '@/components/shipment/tracking-lookup-form';

const TrackingPage = () => {
  return (
    <>
      <SiteNav />
      <main className="flex flex-1 flex-col items-center gap-8 bg-brand-paper px-6 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-3xl font-semibold text-brand-ink">Track a Shipment</h1>
          <p className="text-brand-ink/60">Enter your tracking number to see where it is.</p>
        </div>
        <TrackingLookupForm />
      </main>
    </>
  );
};

export default TrackingPage;
