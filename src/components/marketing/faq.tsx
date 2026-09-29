import { ChevronDown } from 'lucide-react';

import Reveal from '@/components/marketing/reveal';

export type FaqItem = { question: string; answer: string };

// Native <details>: keyboard accessible, works without JavaScript, and the
// answers stay in the HTML for search engines (mirrored in FAQPage
// structured data on the home page).
const Faq = ({ items }: { items: FaqItem[] }) => {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-route">FAQ</p>
          <h2 id="faq-heading" className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            Questions about sending a parcel
          </h2>
        </Reveal>
        <div className="mt-10 flex flex-col gap-3">
          {items.map((item, index) => (
            <Reveal key={item.question} delay={Math.min(index, 4) * 60}>
              <details className="group rounded-2xl border border-brand-ink/10 bg-brand-paper px-5 open:bg-white open:shadow-sm [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex min-h-14 cursor-pointer select-none items-center justify-between gap-4 py-4 font-display text-lg font-medium text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-route rounded-xl">
                  {item.question}
                  <ChevronDown className="size-5 shrink-0 text-brand-route transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                </summary>
                <p className="pb-5 text-brand-ink/70">{item.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Faq;
