'use client';

import { useState } from 'react';
import { Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { LOCALES, LOCALE_NAMES, localizedPath, saveLocale, splitLocalePrefix } from '@/i18n/config';
import { useAppLocale } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import type { Locale } from '@/i18n/config';

type LanguageSwitcherProps = {
  className?: string;
  // "onDark" for the dark hero/header surfaces.
  tone?: 'default' | 'onDark';
  // Short labels (EN / AR) for tight spaces such as the mobile header.
  compact?: boolean;
  // Stacked, for the collapsed dashboard sidebar.
  vertical?: boolean;
};

const SHORT_NAMES: Record<Locale, string> = { en: 'EN', ar: 'AR' };

// English | العربية. Saves the choice in the locale cookie (the single
// source of truth, read by the proxy), then loads the page again in the new
// language. Public pages also move to their own URL for that language
// (/tracking ↔ /ar/tracking).
//
// It's a full page load on purpose. A soft refresh keeps the browser's
// router cache, client state that already holds translated text, and a
// Google Maps script loaded in the old language — which is how pages ended
// up half English, half Arabic.
const LanguageSwitcher = ({ className, tone = 'default', compact = false, vertical = false }: LanguageSwitcherProps) => {
  const t = useTranslations('common.language');
  const current = useAppLocale();
  const [pending, setPending] = useState(false);

  const choose = (next: Locale) => {
    if (next === current || pending) return;
    setPending(true);
    saveLocale(next);

    const { pathname } = splitLocalePrefix(window.location.pathname);
    const target = localizedPath(pathname, next);
    // Same page, the other language's address (public pages only).
    if (target !== window.location.pathname) {
      window.location.replace(`${target}${window.location.search}${window.location.hash}`);
    } else {
      window.location.reload();
    }
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
            lang={compact ? undefined : locale}
            disabled={pending}
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
