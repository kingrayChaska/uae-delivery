import Link from "next/link";

import Button from "@/components/ui/button";
import MobileNav from "@/components/marketing/mobile-nav";
import StickyHeader from "@/components/marketing/sticky-header";
import Logo from "@/components/brand/logo";

// Section anchors are absolute ("/#pricing") so the same nav works on
// /tracking and the legal pages, not only the home page.
export const NAV_LINKS = [
  { label: "Services", href: "/#services" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Merchants", href: "/#merchants" },
  { label: "Track", href: "/tracking" },
  { label: "Contact", href: "/#contact" },
];

const SiteNav = () => {
  return (
    <StickyHeader>
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 md:h-18">
        <Logo height={34} priority />

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand-ink/70 transition-colors hover:bg-brand-ink/5 hover:text-brand-ink focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden text-brand-ink hover:bg-brand-ink/5 sm:inline-flex"
          >
            <Link href="/login">Sign in</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="hidden bg-brand-route text-brand-paper hover:bg-brand-route/90 sm:inline-flex"
          >
            <Link href="/register">Book a delivery</Link>
          </Button>
          <MobileNav links={NAV_LINKS} />
        </div>
      </div>
    </StickyHeader>
  );
};

export default SiteNav;
