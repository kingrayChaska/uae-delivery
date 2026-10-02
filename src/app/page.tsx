import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import BusinessSolutions from "@/components/marketing/business-solutions";
import ContactSection from "@/components/marketing/contact-section";
import Faq from "@/components/marketing/faq";
import Hero from "@/components/marketing/hero";
import HowItWorks from "@/components/marketing/how-it-works";
import LiveTrackingDemo from "@/components/marketing/live-tracking-demo";
import PricingSection from "@/components/marketing/pricing-section";
import Services from "@/components/marketing/services";
import Testimonials from "@/components/marketing/testimonials";
import SiteFooter from "@/components/marketing/site-footer";
import SiteNav from "@/components/marketing/site-nav";
import { getActivePricingRules } from "@/lib/pricing/get-active-rule";
import { SITE_NAME, localizedAlternates, siteUrl } from "@/lib/seo";
import { BRAND } from "@/lib/brand";
import { OG_LOCALES, localizedPath } from "@/i18n/config";
import { getFormat, getRequestLocale } from "@/i18n/server";

import type { Metadata } from "next";
import type { FaqItem } from "@/components/marketing/faq";
import type { DeliveryType, PricingRule } from "@/lib/types";
import type { Formatters } from "@/i18n/format";

export const generateMetadata = async (): Promise<Metadata> => {
  const [rules, t, locale, format] = await Promise.all([
    getActivePricingRules(),
    getTranslations("meta"),
    getRequestLocale(),
    getFormat(),
  ]);
  const nextDay = rules.individual.next_day;
  const title = t("siteTitle");
  const description = t("homeDescription", {
    price: `${nextDay.currency} ${format.number(nextDay.basePrice, { maximumFractionDigits: 0 })}`,
  });
  const alternates = localizedAlternates("/", locale);
  return {
    title,
    description,
    keywords: t("keywords")
      .split(",")
      .map((keyword) => keyword.trim()),
    alternates,
    openGraph: {
      type: "website",
      url: alternates.canonical,
      siteName: SITE_NAME,
      title,
      description,
      locale: OG_LOCALES[locale],
      alternateLocale: Object.values(OG_LOCALES).filter(
        (og) => og !== OG_LOCALES[locale],
      ),
    },
    twitter: { card: "summary_large_image", title, description },
  };
};

const faqItems = async (
  rules: Record<DeliveryType, PricingRule>,
  format: Formatters,
): Promise<FaqItem[]> => {
  const t = await getTranslations("marketing.faq.items");
  const { next_day: nextDay, same_day: sameDay } = rules;
  const money = (rule: PricingRule, value: number) =>
    `${rule.currency} ${format.number(value, { maximumFractionDigits: 2 })}`;
  const keys = [
    "cost",
    "difference",
    "range",
    "track",
    "cod",
    "merchant",
    "multiple",
  ] as const;
  const values = {
    cost: {
      nextDayBase: money(nextDay, nextDay.basePrice),
      nextDayDistance: format.km(nextDay.baseDistanceKm, 0),
      nextDayPerKm: money(nextDay, nextDay.additionalPricePerKm),
      sameDayBase: money(sameDay, sameDay.basePrice),
      sameDayDistance: format.km(sameDay.baseDistanceKm, 0),
      sameDayPerKm: money(sameDay, sameDay.additionalPricePerKm),
      includedWeight: format.kg(sameDay.includedWeightKg),
      perKg: money(sameDay, sameDay.additionalPricePerKg),
    },
    range: {
      distance: format.km(
        Math.max(nextDay.maxDistanceKm, sameDay.maxDistanceKm),
        0,
      ),
    },
  } as const;
  return keys.map((key) => ({
    question: t(`${key}.question`),
    answer:
      key === "cost"
        ? t("cost.answer", values.cost)
        : key === "range"
          ? t("range.answer", values.range)
          : t(`${key}.answer`),
  }));
};

const HomePage = async () => {
  const [rules, nonce, locale, format, tCommon, tData] = await Promise.all([
    getActivePricingRules(),
    headers().then((h) => h.get("x-nonce") ?? undefined),
    getRequestLocale(),
    getFormat(),
    getTranslations("common"),
    getTranslations("marketing.structuredData"),
  ]);
  const individual = rules.individual;
  const faq = await faqItems(individual, format);
  const url = siteUrl();
  const pageUrl = `${url}${localizedPath("/", locale) === "/" ? "" : localizedPath("/", locale)}`;

  // Structured data for search engines: who we are, the two services with
  // their real starting prices, and the FAQ above — in the page's language.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${url}/#organization`,
        name: SITE_NAME,
        url,
        logo: `${url}${BRAND.logoSrc}`,
        areaServed: { "@type": "Country", name: tData("country") },
      },
      {
        "@type": "WebSite",
        "@id": `${url}/#website`,
        name: SITE_NAME,
        url,
        inLanguage: ["en", "ar"],
        publisher: { "@id": `${url}/#organization` },
      },
      ...(["next_day", "same_day"] as const).map((type) => ({
        "@type": "Service",
        name:
          type === "next_day"
            ? tData("nextDayService")
            : tData("sameDayService"),
        serviceType: tData("serviceType"),
        provider: { "@id": `${url}/#organization` },
        areaServed: { "@type": "Country", name: tData("country") },
        offers: {
          "@type": "Offer",
          priceCurrency: individual[type].currency,
          price: individual[type].basePrice.toFixed(2),
          description: tData("offer", {
            distance: format.km(individual[type].baseDistanceKm, 0),
            perKm: `${individual[type].currency} ${format.number(individual[type].additionalPricePerKm, { maximumFractionDigits: 2 })}`,
          }),
        },
      })),
      {
        "@type": "FAQPage",
        url: pageUrl,
        inLanguage: locale,
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
        className="sr-only z-50 rounded-lg bg-brand-route px-4 py-2 text-brand-paper focus:not-sr-only focus:fixed focus:inset-s-4 focus:top-4"
      >
        {tCommon("skipToContent")}
      </a>
      <SiteNav />
      <main id="main" className="flex flex-1 flex-col">
        <Hero />
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
