'use client';

import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_NAMES, localizedPath, splitLocalePrefix } from '@/i18n/config';
import { useAppLocale } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import type { Locale } from '@/i18n/config';

type LanguageSwitcherProps = {
  className?: string;
  // "onDark" for the dark hero/header surfaces.
  tone?: 'default' | 'onDark';
  // Short labels (EN / ع) for tight spaces such as the mobile header.
  compact?: boolean;
  // Stacked, for the collapsed dashboard sidebar.
  vertical?: boolean;
};

const SHORT_NAMES: Record<Locale, string> = { en: 'EN', ar: 'ع' };

const saveLocale = (locale: Locale) => {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
};

// English | العربية. Saves the choice in the locale cookie (the single
// source of truth, read by the proxy), then re-renders the page on the
// server in the new language — no full page reload. Public pages also move
// to their own URL for that language (/tracking ↔ /ar/tracking).
const LanguageSwitcher = ({ className, tone = 'default', compact = false, vertical = false }: LanguageSwitcherProps) => {
  const t = useTranslations('common.language');
  const router = useRouter();
  const current = useAppLocale();
  const [pending, startTransition] = useTransition();

  const choose = (next: Locale) => {
    if (next === current || pending) return;
    saveLocale(next);

    const { pathname } = splitLocalePrefix(window.location.pathname);
    const target = localizedPath(pathname, next);
    startTransition(() => {
      // Same page, the other language's address (public pages only).
      if (target !== window.location.pathname) {
        router.replace(`${target}${window.location.search}${window.location.hash}`, { scroll: false });
      }
      // Both languages share the root layout, which a navigation alone keeps
      // as it was — the refresh re-renders it (<html lang dir>, messages).
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label={t('label')}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-lg border p-0.5 text-sm',
        vertical && 'flex-col',
        tone === 'onDark' ? 'border-white/25 bg-white/10' : 'border-border bg-background',
        pending && 'opacity-70',
        className,
      )}
    >
      <Languages
        className={cn(
          'mx-1.5 size-4 shrink-0',
          tone === 'onDark' ? 'text-white/70' : 'text-muted-foreground',
          compact && 'hidden sm:block',
          vertical && 'my-1 sm:hidden',
        )}
        aria-hidden
      />
      {LOCALES.map((locale) => {
        const selected = locale === current;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={selected}
            aria-label={compact ? LOCALE_NAMES[locale] : undefined}
            onClick={() => choose(locale)}
            className={cn(
              'min-h-9 min-w-9 rounded-md px-2.5 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? tone === 'onDark'
                  ? 'bg-white text-brand-route-deep'
                  : 'bg-primary text-primary-foreground'
                : tone === 'onDark'
                  ? 'text-white/85 hover:bg-white/15'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {compact ? SHORT_NAMES[locale] : LOCALE_NAMES[locale]}
          </button>
        );
      })}
    </div>
  );
};

export default LanguageSwitcher;
