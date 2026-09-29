import { headers } from "next/headers";

import BusinessSolutions from "@/components/marketing/business-solutions";
import ContactSection from "@/components/marketing/contact-section";
import Faq from "@/components/marketing/faq";
import Hero from "@/components/marketing/hero";
import HowItWorks from "@/components/marketing/how-it-works";
import LiveTrackingDemo from "@/components/marketing/live-tracking-demo";
import PricingSection from "@/components/marketing/pricing-section";
import ProductFacts from "@/components/marketing/product-facts";
import Services from "@/components/marketing/services";
import Testimonials from "@/components/marketing/testimonials";
import SiteFooter from "@/components/marketing/site-footer";
import SiteNav from "@/components/marketing/site-nav";
import { getActivePricingRules } from "@/lib/pricing/get-active-rule";
import { SITE_KEYWORDS, SITE_NAME, SITE_TITLE, siteUrl } from "@/lib/seo";
import { BRAND } from "@/lib/brand";

import type { Metadata } from "next";
import type { FaqItem } from "@/components/marketing/faq";
import type { DeliveryType, PricingRule } from "@/lib/types";

const describe = (nextDay: PricingRule) =>
  `Book same-day and next-day parcel delivery across the UAE, from ${nextDay.currency} ${nextDay.basePrice.toFixed(0)}. Upfront pricing, live shipment tracking, proof of delivery, cash on delivery and merchant logistics for businesses.`;

export const generateMetadata = async (): Promise<Metadata> => {
  const rules = (await getActivePricingRules()).individual;
  const description = describe(rules.next_day);
  return {
    title: SITE_TITLE,
    description,
    keywords: SITE_KEYWORDS,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "/",
      siteName: SITE_NAME,
      title: SITE_TITLE,
      description,
      locale: "en_AE",
    },
    twitter: { card: "summary_large_image", title: SITE_TITLE, description },
  };
};

const faqItems = (rules: Record<DeliveryType, PricingRule>): FaqItem[] => {
  const { next_day: nextDay, same_day: sameDay } = rules;
  return [
    {
      question: "How much does parcel delivery cost?",
      answer: `Next-day delivery is ${nextDay.currency} ${nextDay.basePrice} for the first ${nextDay.baseDistanceKm} km, then ${nextDay.currency} ${nextDay.additionalPricePerKm} for each additional km. Same-day delivery is ${sameDay.currency} ${sameDay.basePrice} for the first ${sameDay.baseDistanceKm} km, then ${sameDay.currency} ${sameDay.additionalPricePerKm} per km. Up to ${sameDay.includedWeightKg} kg is included; each extra kg adds ${sameDay.currency} ${sameDay.additionalPricePerKg}. You see the full price before you book.`,
    },
    {
      question:
        "What is the difference between same-day and next-day delivery?",
      answer:
        "Same-day parcels are collected and delivered on the day you book. Next-day parcels are delivered the following day at a lower price.",
    },
    {
      question: "How far can you deliver?",
      answer: `We deliver within the UAE for trips of up to ${Math.max(nextDay.maxDistanceKm, sameDay.maxDistanceKm)} km by road between pickup and delivery. For longer distances, contact our support team.`,
    },
    {
      question: "How do I track my shipment?",
      answer:
        "Every shipment gets a short tracking ID of up to 8 characters. Enter it on the tracking page, or sign in to follow all your shipments and view proof of delivery.",
    },
    {
      question: "Can the driver collect payment from the recipient?",
      answer:
        "Yes. When booking, mark the parcel as postpaid (cash on delivery) and enter the amount to collect. The driver collects it from the recipient, separately from your delivery fee.",
    },
    {
      question: "How do I open a merchant account?",
      answer:
        "Create a free account, choose “Merchant” and submit your company details. Our team reviews every application; once approved you get flat-rate merchant pricing.",
    },
    {
      question: "Can I send several parcels in one booking?",
      answer:
        "Yes. Add as many shipments as you need to one booking — each can go to a different address — and pay for them together.",
    },
  ];
};

const HomePage = async () => {
  const [rules, nonce] = await Promise.all([
    getActivePricingRules(),
    headers().then((h) => h.get("x-nonce") ?? undefined),
  ]);
  const individual = rules.individual;
  const faq = faqItems(individual);
  const url = siteUrl();

  // Structured data for search engines: who we are, the two services with
  // their real starting prices, and the FAQ above.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${url}/#organization`,
        name: SITE_NAME,
        url,
        logo: `${url}${BRAND.logoSrc}`,
        areaServed: { "@type": "Country", name: "United Arab Emirates" },
      },
      {
        "@type": "WebSite",
        "@id": `${url}/#website`,
        name: SITE_NAME,
        url,
        publisher: { "@id": `${url}/#organization` },
      },
      ...(["next_day", "same_day"] as const).map((type) => ({
        "@type": "Service",
        name:
          type === "next_day"
            ? "Next-Day Parcel Delivery"
            : "Same-Day Parcel Delivery",
        serviceType: "Courier service",
        provider: { "@id": `${url}/#organization` },
        areaServed: { "@type": "Country", name: "United Arab Emirates" },
        offers: {
          "@type": "Offer",
          priceCurrency: individual[type].currency,
          price: individual[type].basePrice.toFixed(2),
          description: `First ${individual[type].baseDistanceKm} km; ${individual[type].currency} ${individual[type].additionalPricePerKm} per additional km.`,
        },
      })),
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };

  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-brand-route px-4 py-2 text-brand-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main" className="flex flex-1 flex-col">
        <Hero nextDay={individual.next_day} />
        <ProductFacts
          nextDay={individual.next_day}
          sameDay={individual.same_day}
        />
        <PricingSection rules={individual} />
        <Services />
        <HowItWorks />
        <BusinessSolutions />
        <LiveTrackingDemo />
        <Testimonials />
        <Faq items={faq} />
        <ContactSection />
      </main>
      <SiteFooter />
      <script
        type="application/ld+json"
        nonce={nonce}
        // JSON.stringify output with "<" escaped can't break out of the tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
};

export default HomePage;
