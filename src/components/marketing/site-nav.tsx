import Link from "next/link";
import { getTranslations } from "next-intl/server";

import Button from "@/components/ui/button";
import MobileNav from "@/components/marketing/mobile-nav";
import StickyHeader from "@/components/marketing/sticky-header";
import Logo from "@/components/brand/logo";
import LanguageSwitcher from "@/components/i18n/language-switcher";
import { localizeHref } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";

// Section anchors are absolute ("/#pricing") so the same nav works on
// /tracking and the legal pages, not only the home page.
export const NAV_LINKS = [
  { key: "services", href: "/#services" },
  { key: "howItWorks", href: "/#how-it-works" },
  { key: "pricing", href: "/#pricing" },
  { key: "merchants", href: "/#merchants" },
  { key: "track", href: "/tracking" },
  { key: "contact", href: "/#contact" },
] as const;

const SiteNav = async () => {
  const [t, locale] = await Promise.all([getTranslations("nav"), getRequestLocale()]);
  const links = NAV_LINKS.map((link) => ({ label: t(`links.${link.key}`), href: localizeHref(link.href, locale) }));

  return (
    <StickyHeader>
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6 md:h-18">
        <Logo height={34} priority />

        <nav aria-label={t("main")} className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-brand-ink/70 transition-colors hover:bg-brand-ink/5 hover:text-brand-ink focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden text-brand-ink hover:bg-brand-ink/5 sm:inline-flex"
          >
            <Link href={localizeHref("/login", locale)}>{t("signIn")}</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="hidden bg-brand-route text-brand-paper hover:bg-brand-route/90 sm:inline-flex"
          >
            <Link href={localizeHref("/register", locale)}>{t("book")}</Link>
          </Button>
          <MobileNav links={links} />
        </div>
      </div>
    </StickyHeader>
  );
};

export default SiteNav;
