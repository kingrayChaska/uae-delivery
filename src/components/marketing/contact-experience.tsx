"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  Clock3,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
} from "lucide-react";

import { COMPANY } from "@/lib/brand";

const WHATSAPP_NUMBER = COMPANY.whatsapp;
const DISPLAY_PHONE = COMPANY.phone;
const EMAIL = COMPANY.email;

const TOPICS = ["sameDay", "nextDay", "business", "cod", "agent", "other"] as const;

const ContactForm = () => {
  const t = useTranslations("marketing.contact.form");
  const [notice, setNotice] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const topic = String(form.get("service"));
    // Written in the visitor's language — our team answers in both.
    const message = t("whatsappMessage", {
      name: String(form.get("name")),
      phone: String(form.get("phone")),
      topic: (TOPICS as readonly string[]).includes(topic) ? t(`topics.${topic as (typeof TOPICS)[number]}`) : topic,
      message: String(form.get("message")),
    });

    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setNotice(t("sent"));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-brand-ink">
          {t("name")}
          <input
            name="name"
            autoComplete="name"
            required
            className="mt-2 min-h-12 w-full rounded-md border border-brand-ink/15 bg-white px-3 text-base font-normal outline-none transition focus:border-brand-signal focus:ring-2 focus:ring-brand-signal/20"
            placeholder={t("namePlaceholder")}
          />
        </label>
        <label className="block text-sm font-medium text-brand-ink">
          {t("phone")}
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            dir="ltr"
            className="mt-2 min-h-12 w-full rounded-md border border-brand-ink/15 bg-white px-3 text-base font-normal outline-none transition focus:border-brand-signal focus:ring-2 focus:ring-brand-signal/20 rtl:text-right"
            placeholder="+971 5X XXX XXXX"
          />
        </label>
      </div>

      <label className="block text-sm font-medium text-brand-ink">
        {t("topic")}
        <select
          name="service"
          required
          defaultValue=""
          className="mt-2 min-h-12 w-full rounded-md border border-brand-ink/15 bg-white px-3 text-base font-normal outline-none transition focus:border-brand-signal focus:ring-2 focus:ring-brand-signal/20"
        >
          <option value="" disabled>
            {t("topicPlaceholder")}
          </option>
          {TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {t(`topics.${topic}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium text-brand-ink">
        {t("message")}
        <textarea
          name="message"
          required
          rows={5}
          className="mt-2 w-full resize-y rounded-md border border-brand-ink/15 bg-white px-3 py-3 text-base font-normal outline-none transition focus:border-brand-signal focus:ring-2 focus:ring-brand-signal/20"
          placeholder={t("messagePlaceholder")}
        />
      </label>

      <button
        type="submit"
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-brand-route px-5 text-sm font-semibold text-white transition hover:bg-brand-route-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-route"
      >
        <Send aria-hidden="true" size={17} className="rtl:-scale-x-100" />
        {t("submit")}
        <ArrowUpRight aria-hidden="true" size={16} className="rtl:-scale-x-100" />
      </button>
      <p aria-live="polite" className="min-h-5 text-sm text-brand-muted">
        {notice}
      </p>
    </form>
  );
};

const ContactExperience = () => {
  const t = useTranslations("marketing.contact");

  return (
    <>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:gap-16">
        <section aria-labelledby="message-heading" className="min-w-0">
          <div className="mb-8">
            <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-brand-signal">
              {t("form.eyebrow")}
            </p>
            <h2
              id="message-heading"
              className="mt-2 font-display text-3xl font-semibold text-brand-ink"
            >
              {t("form.title")}
            </h2>
            <p className="mt-3 max-w-xl leading-7 text-brand-muted">
              {t("form.subtitle")}
            </p>
          </div>
          <ContactForm />
        </section>

        <aside
          aria-label={t("details.label")}
          className="border-t border-brand-ink/10 pt-8 lg:border-s lg:border-t-0 lg:ps-10 lg:pt-0"
        >
          <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-brand-signal">
            {t("details.eyebrow")}
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-brand-ink">
            {t("details.title")}
          </h2>
          <div className="mt-7 divide-y divide-brand-ink/10">
            <a
              href={`tel:${DISPLAY_PHONE.replaceAll(" ", "")}`}
              className="group flex gap-4 py-5 first:pt-0"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-signal/10 text-brand-signal">
                <Phone aria-hidden="true" size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium uppercase tracking-wide text-brand-muted">
                  {t("details.phone")}
                </span>
                <span dir="ltr" className="mt-1 block text-base font-semibold text-brand-ink group-hover:text-brand-route rtl:text-right">
                  {DISPLAY_PHONE}
                </span>
              </span>
            </a>
            <a
              href={`mailto:${EMAIL}`}
              className="group flex gap-4 py-5"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-route/10 text-brand-route">
                <Mail aria-hidden="true" size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium uppercase tracking-wide text-brand-muted">
                  {t("details.email")}
                </span>
                <span dir="ltr" className="mt-1 block break-all text-base font-semibold text-brand-ink group-hover:text-brand-route rtl:text-right">
                  {EMAIL}
                </span>
              </span>
            </a>
            <div className="flex gap-4 py-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-800">
                <Clock3 aria-hidden="true" size={19} />
              </span>
              <span>
                <span className="block text-xs font-medium uppercase tracking-wide text-brand-muted">
                  {t("details.hours")}
                </span>
                <span className="mt-1 block text-base font-semibold text-brand-ink">
                  {t("details.days")}
                </span>
                <span className="mt-1 block text-sm text-brand-muted">
                  {t("details.time")}
                </span>
              </span>
            </div>
            <div className="flex gap-4 py-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-ink/5 text-brand-ink">
                <MapPin aria-hidden="true" size={19} />
              </span>
              <span>
                <span className="block text-xs font-medium uppercase tracking-wide text-brand-muted">
                  {t("details.base")}
                </span>
                <span className="mt-1 block text-base font-semibold text-brand-ink">
                  {t("details.location")}
                </span>
              </span>
            </div>
          </div>
          <div className="mt-3 border-s-2 border-brand-signal ps-4">
            <p className="text-sm font-semibold text-brand-ink">
              {t("details.coverageTitle")}
            </p>
            <p className="mt-1 text-sm leading-6 text-brand-muted">
              {t("details.coverage")}
            </p>
          </div>
        </aside>
      </div>

      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t("whatsapp.greeting"))}`}
        target="_blank"
        rel="noreferrer"
        aria-label={t("whatsapp.label", { phone: DISPLAY_PHONE })}
        title={`WhatsApp ${DISPLAY_PHONE}`}
        className="fixed bottom-5 end-5 z-40 inline-flex min-h-14 items-center gap-3 rounded-full bg-[#13845a] px-5 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-[#0d704b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#13845a] sm:bottom-7 sm:end-7"
      >
        <MessageCircle aria-hidden="true" size={21} />
        <span>{t("whatsapp.button")}</span>
      </a>
    </>
  );
};

export default ContactExperience;
