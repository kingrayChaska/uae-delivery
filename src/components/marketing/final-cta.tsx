import Link from 'next/link';

import Button from '@/components/ui/button';

const FinalCta = () => {
  return (
    <section className="bg-brand-route-deep py-20 md:py-24">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6">
        <h2 className="font-display text-3xl font-semibold text-brand-paper md:text-4xl">
          Ready to send your next package?
        </h2>
        <Button asChild size="lg" className="bg-brand-signal text-brand-route-deep hover:bg-brand-signal/90">
          <Link href="/register">Book a Delivery</Link>
        </Button>
      </div>
    </section>
  );
};

export default FinalCta;
