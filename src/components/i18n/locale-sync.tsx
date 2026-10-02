'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { readSavedLocale, splitLocalePrefix } from '@/i18n/config';
import { useAppLocale } from '@/i18n/hooks';

// Both languages share the root layout (<html lang dir>, the browser's
// messages), and client-side navigation never re-renders it. So when the
// language changes behind this tab's back — switched in another tab, or the
// back button returning to an /ar address — the next page would render its
// server parts in one language inside a layout of the other. When the page's
// language no longer matches the layout's, load it fresh instead.
const RELOAD_GUARD = 'parcellink-locale-reload';

const LocaleSync = () => {
  const pathname = usePathname();
  const layoutLocale = useAppLocale();

  useEffect(() => {
    // The browser's address, not the route: /ar/tracking renders /tracking.
    const url = window.location.pathname;
    const expected = splitLocalePrefix(url).locale ?? readSavedLocale() ?? layoutLocale;
    try {
      if (expected === layoutLocale) {
        sessionStorage.removeItem(RELOAD_GUARD);
        return;
      }
      // One try per address, so an unexpected disagreement can't loop.
      if (sessionStorage.getItem(RELOAD_GUARD) === url) return;
      sessionStorage.setItem(RELOAD_GUARD, url);
    } catch {
      // Storage blocked: skip the reload rather than risk a loop.
      return;
    }
    window.location.reload();
  }, [pathname, layoutLocale]);

  return null;
};

export default LocaleSync;
