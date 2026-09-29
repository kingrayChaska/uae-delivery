import en from '../../messages/en';

import type { Locale } from '@/i18n/config';

export type Messages = typeof en;

type Tree = { [key: string]: string | Tree };

// Arabic over English: a key that hasn't been translated yet shows the
// English text rather than a raw key. (messages.test.ts fails the build's
// test run if any Arabic key is missing, so this is only a safety net.)
const mergeOver = (base: Tree, override: Tree): Tree => {
  const merged: Tree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] =
      typeof value === 'object' && typeof current === 'object' ? mergeOver(current, value) : value;
  }
  return merged;
};

export const loadMessages = async (locale: Locale): Promise<Messages> => {
  if (locale === 'en') return en;
  const ar = (await import('../../messages/ar')).default;
  return mergeOver(en as unknown as Tree, ar as unknown as Tree) as unknown as Messages;
};

// Namespaces the public pages (landing, sign-in, tracking) use in the
// browser. Dashboards get every namespace (app/dashboard/layout.tsx); the
// public pages ship only these, keeping their pages light.
export const PUBLIC_CLIENT_NAMESPACES = [
  'common',
  'nav',
  'marketing',
  'auth',
  'tracking',
  'shipments',
  'pricing',
  'validation',
  'errors',
] as const satisfies readonly (keyof Messages)[];
