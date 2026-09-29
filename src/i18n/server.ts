import 'server-only';

import { getTranslations } from 'next-intl/server';

import { getRequestLocale } from '@/i18n/request';
import { INTL_LOCALES } from '@/i18n/config';
import { createFormatters } from '@/i18n/format';
import { translateMessage } from '@/i18n/message';

import type { Translator } from '@/i18n/message';

export { getRequestLocale };

export const getFormat = async () => createFormatters(await getRequestLocale());

// Server-side counterpart of useMessage().
export const getMessageTranslator = async () => {
  const [t, locale] = await Promise.all([getTranslations(), getRequestLocale()]);
  return (text: string | null | undefined) => translateMessage(t as unknown as Translator, text, INTL_LOCALES[locale]);
};
