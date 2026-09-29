"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Clock3,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
} from "lucide-react";

const WHATSAPP_NUMBER = "971526123313";
const DISPLAY_PHONE = "+971 52 612 3313";

const ContactForm = () => {
  const [notice, setNotice] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = [
      `Hello ParcelLink, my name is ${form.get("name")}.`,
      `My phone / WhatsApp number is ${form.get("phone")}.`,
      `I'm contacting you about: ${form.get("service")}.`,
      "",
      String(form.get("message")),
    ].join("\n");

    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setNotice(
      "WhatsApp opened with your message. Send it there to reach our team.",
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-brand-ink">
          Full name
          <input
            name="name"
            autoComplete="name"
            required
            className="mt-2 min-h-12 w-full rounded-md border border-brand-ink/15 bg-white px-3 text-base font-normal outline-none transition focus:border-brand-signal focus:ring-2 focus:ring-brand-signal/20"
            placeholder="Your name"
          />
        </label>
        <label className="block text-sm font-medium text-brand-ink">
          Phone / WhatsApp
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            className="mt-2 min-h-12 w-full rounded-md border border-brand-ink/15 bg-white px-3 text-base font-normal outline-none transition focus:border-brand-signal focus:ring-2 focus:ring-brand-signal/20"
            placeholder="+971 5X XXX XXXX"
          />
        </label>
      </div>

      <label className="block text-sm font-medium text-brand-ink">
        What can we help with?
        <select
          name="service"
          required
          defaultValue=""
          className="mt-2 min-h-12 w-full rounded-md border border-brand-ink/15 bg-white px-3 text-base font-normal outline-none transition focus:border-brand-signal focus:ring-2 focus:ring-brand-signal/20"
        >
          <option value="" disabled>
            Select a topic
          </option>
          <option>Same-day delivery</option>
          <option>Next-day delivery</option>
          <option>Business and e-commerce deliveries</option>
          <option>Cash on delivery</option>
          <option>Commission Agent program</option>
          <option>Other enquiry</option>
        </select>
      </label>

      <label className="block text-sm font-medium text-brand-ink">
        Message
        <textarea
          name="message"
          required
          rows={5}
          className="mt-2 w-full resize-y rounded-md border border-brand-ink/15 bg-white px-3 py-3 text-base font-normal outline-none transition focus:border-brand-signal focus:ring-2 focus:ring-brand-signal/20"
          placeholder="Tell us how we can help."
        />
      </label>

      <button
        type="submit"
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-brand-route px-5 text-sm font-semibold text-white transition hover:bg-brand-route-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-route"
      >
        <Send aria-hidden="true" size={17} />
        Continue in WhatsApp
        <ArrowUpRight aria-hidden="true" size={16} />
      </button>
      <p aria-live="polite" className="min-h-5 text-sm text-brand-muted">
        {notice}
      </p>
    </form>
  );
};

const ContactExperience = () => (
  <>
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:gap-16">
      <section aria-labelledby="message-heading" className="min-w-0">
        <div className="mb-8">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-brand-signal">
            Send us a message
          </p>
          <h2
            id="message-heading"
            className="mt-2 font-display text-3xl font-semibold text-brand-ink"
          >
            Tell us what you need
          </h2>
          <p className="mt-3 max-w-xl leading-7 text-brand-muted">
            Share a few details and we’ll prepare a message for our WhatsApp
            team. We support customers in Arabic and English.
          </p>
        </div>
        <ContactForm />
      </section>

      <aside
        aria-label="Contact details"
        className="border-t border-brand-ink/10 pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0"
      >
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-brand-signal">
          Talk to our team
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-brand-ink">
          Here when your parcel needs us.
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
                Phone / WhatsApp
              </span>
              <span className="mt-1 block text-base font-semibold text-brand-ink group-hover:text-brand-route">
                {DISPLAY_PHONE}
              </span>
            </span>
          </a>
          <a
            href="mailto:admin@parcellinkuae.com"
            className="group flex gap-4 py-5"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-route/10 text-brand-route">
              <Mail aria-hidden="true" size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium uppercase tracking-wide text-brand-muted">
                Email
              </span>
              <span className="mt-1 block break-all text-base font-semibold text-brand-ink group-hover:text-brand-route">
                admin@parcellinkuae.com
              </span>
            </span>
          </a>
          <div className="flex gap-4 py-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-800">
              <Clock3 aria-hidden="true" size={19} />
            </span>
            <span>
              <span className="block text-xs font-medium uppercase tracking-wide text-brand-muted">
                Support hours
              </span>
              <span className="mt-1 block text-base font-semibold text-brand-ink">
                Monday–Saturday
              </span>
              <span className="mt-1 block text-sm text-brand-muted">
                8:00 AM–6:00 PM
              </span>
            </span>
          </div>
          <div className="flex gap-4 py-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-ink/5 text-brand-ink">
              <MapPin aria-hidden="true" size={19} />
            </span>
            <span>
              <span className="block text-xs font-medium uppercase tracking-wide text-brand-muted">
                Base
              </span>
              <span className="mt-1 block text-base font-semibold text-brand-ink">
                Dubai, United Arab Emirates
              </span>
            </span>
          </div>
        </div>
        <div className="mt-3 border-l-2 border-brand-signal pl-4">
          <p className="text-sm font-semibold text-brand-ink">
            Service coverage
          </p>
          <p className="mt-1 text-sm leading-6 text-brand-muted">
            Same-day delivery in Dubai, Sharjah and Ajman. Abu Dhabi, Ras Al
            Khaimah, Fujairah and Umm Al Quwain are available on request.
          </p>
        </div>
      </aside>
    </div>

    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hello ParcelLink, I have a delivery enquiry.")}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Chat with ParcelLink on WhatsApp at ${DISPLAY_PHONE}`}
      title={`WhatsApp ${DISPLAY_PHONE}`}
      className="fixed bottom-5 right-5 z-40 inline-flex min-h-14 items-center gap-3 rounded-full bg-[#13845a] px-5 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-[#0d704b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#13845a] sm:bottom-7 sm:right-7"
    >
      <MessageCircle aria-hidden="true" size={21} />
      <span>WhatsApp us</span>
    </a>
  </>
);

export default ContactExperience;
