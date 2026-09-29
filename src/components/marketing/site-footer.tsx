import Link from "next/link";
import { getTranslations } from "next-intl/server";

import Logo from "@/components/brand/logo";
import { localizeHref } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";

const FOOTER_LINKS = [
  {
    group: "services",
    links: [
      { key: "sameDay", href: "/#services" },
      { key: "nextDay", href: "/#pricing" },
      { key: "cod", href: "/#merchants" },
      { key: "pricing", href: "/#pricing" },
    ],
  },
  {
    group: "customers",
    links: [
      { key: "track", href: "/tracking" },
      { key: "book", href: "/register" },
      { key: "signIn", href: "/login" },
      { key: "faq", href: "/#faq" },
    ],
  },
  {
    group: "merchants",
    links: [
      { key: "accounts", href: "/#merchants" },
      { key: "apply", href: "/register" },
    ],
  },
  {
    group: "company",
    links: [
      { key: "contact", href: "/#contact" },
      { key: "privacy", href: "/privacy" },
      { key: "terms", href: "/terms" },
    ],
  },
] as const;

const SiteFooter = async () => {
  const [t, locale] = await Promise.all([getTranslations("footer"), getRequestLocale()]);

  return (
    <footer className="border-t border-brand-ink/10 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-6">
          <div className="sm:col-span-2">
            <Logo height={32} />
            <p className="mt-3 max-w-xs text-sm text-brand-ink/60">{t("tagline")}</p>
          </div>

          {FOOTER_LINKS.map(({ group, links }) => {
            const heading = t(`groups.${group}.heading`);
            return (
              <nav key={group} aria-label={heading}>
                <p className="text-sm font-semibold text-brand-ink">{heading}</p>
                <ul className="mt-3 flex flex-col gap-1">
                  {links.map((link) => (
                    <li key={link.key}>
                      <Link
                        href={localizeHref(link.href, locale)}
                        className="inline-flex min-h-9 items-center text-sm text-brand-ink/60 transition-colors hover:text-brand-ink focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none"
                      >
                        {t(`groups.${group}.${link.key}` as `groups.services.sameDay`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            );
          })}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-brand-ink/10 pt-6 text-sm text-brand-ink/50 sm:flex-row sm:items-center sm:justify-between">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          <p>{t("delivering")}</p>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
