import { useLocale, useTranslations } from 'next-intl';

import { INTL_LOCALES, toLocale } from '@/i18n/config';
import { createFormatters } from '@/i18n/format';
import { translateMessage } from '@/i18n/message';

import type { Translator } from '@/i18n/message';

// Hooks for components that render on the server or in the browser alike
// (next-intl's hooks work in both). Async server components use
// i18n/server.ts instead.

// 'en' | 'ar' for the page being shown.
export const useAppLocale = () => toLocale(useLocale());

export const useFormat = () => createFormatters(useAppLocale());

// Translates a message made by msg() (validation errors, server-action
// errors), or shows other text as it is.
export const useMessage = () => {
  const t = useTranslations() as unknown as Translator;
  const locale = useAppLocale();
  return (text: string | null | undefined) => translateMessage(t, text, INTL_LOCALES[locale]);
};
