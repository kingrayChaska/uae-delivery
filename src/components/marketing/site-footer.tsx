import Link from "next/link";

import Logo from "@/components/brand/logo";

const FOOTER_LINKS: {
  heading: string;
  links: { label: string; href: string }[];
}[] = [
  {
    heading: "Services",
    links: [
      { label: "Same-day delivery", href: "/#services" },
      { label: "Next-day delivery", href: "/#pricing" },
      { label: "Cash on delivery", href: "/#merchants" },
      { label: "Pricing", href: "/#pricing" },
    ],
  },
  {
    heading: "Customers",
    links: [
      { label: "Track a shipment", href: "/tracking" },
      { label: "Book a delivery", href: "/register" },
      { label: "Sign in", href: "/login" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    heading: "Merchants",
    links: [
      { label: "Merchant accounts", href: "/#merchants" },
      { label: "Apply as a merchant", href: "/register" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Contact us", href: "/#contact" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
    ],
  },
];

const SiteFooter = () => {
  return (
    <footer className="border-t border-brand-ink/10 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-6">
          <div className="sm:col-span-2">
            <Logo height={32} />
            <p className="mt-3 max-w-xs text-sm text-brand-ink/60">
              Parcel delivery and courier service across the UAE — same-day,
              next-day and merchant logistics with live shipment tracking.
            </p>
          </div>

          {FOOTER_LINKS.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <p className="text-sm font-semibold text-brand-ink">
                {group.heading}
              </p>
              <ul className="mt-3 flex flex-col gap-1">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-9 items-center text-sm text-brand-ink/60 transition-colors hover:text-brand-ink focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-brand-ink/10 pt-6 text-sm text-brand-ink/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ParcelLink. All rights reserved.</p>
          <p>Delivering across the United Arab Emirates.</p>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
