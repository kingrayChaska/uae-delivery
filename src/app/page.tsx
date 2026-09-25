import { Suspense } from 'react';

import BusinessSolutions from '@/components/marketing/business-solutions';
import FinalCta from '@/components/marketing/final-cta';
import Hero from '@/components/marketing/hero';
import HowItWorks from '@/components/marketing/how-it-works';
import LiveTrackingDemo from '@/components/marketing/live-tracking-demo';
import PricingSection from '@/components/marketing/pricing-section';
import Services from '@/components/marketing/services';
import SiteFooter from '@/components/marketing/site-footer';
import SiteNav from '@/components/marketing/site-nav';

const HomePage = () => {
  return (
    <>
      <SiteNav />
      <main className="flex flex-1 flex-col">
        <Hero />
        <Services />
        <HowItWorks />
        <LiveTrackingDemo />
        <BusinessSolutions />
        {/* Pricing reads the active rule from Supabase; streaming it lets the
            rest of the page reach the browser without waiting on that query. */}
        <Suspense fallback={<section id="pricing" className="min-h-144 bg-white" />}>
          <PricingSection />
        </Suspense>
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
};

export default HomePage;
