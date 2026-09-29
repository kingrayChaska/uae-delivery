import { getTranslations } from "next-intl/server";

import ContactExperience from "@/components/marketing/contact-experience";

// The landing page's contact section (formerly the /contact page). Linked
// from the site nav and footer as /#contact.
const ContactSection = async () => {
  const t = await getTranslations("marketing.contact");

  return (
    <section
      id="contact"
      aria-labelledby="contact-heading"
      className="scroll-mt-20 border-t border-brand-ink/10 bg-white"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
        <div className="mb-10 max-w-2xl">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-brand-signal">
            {t("eyebrow")}
          </p>
          <h2
            id="contact-heading"
            className="mt-3 font-display text-3xl font-semibold text-brand-ink sm:text-4xl"
          >
            {t("title")}
          </h2>
          <p className="mt-4 text-base leading-7 text-brand-muted">
            {t("subtitle")}
          </p>
        </div>
        <ContactExperience />
      </div>
    </section>
  );
};

export default ContactSection;
