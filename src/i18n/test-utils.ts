import { createTranslator } from 'next-intl';

import en from '../../messages/en';
import ar from '../../messages/ar';
import { INTL_LOCALES } from '@/i18n/config';
import { translateMessage } from '@/i18n/message';

import type { Locale } from '@/i18n/config';
import type { Translator } from '@/i18n/message';

// For unit tests: renders a msg() string the way a reader of `locale` sees it.
export const renderMessage = (locale: Locale) => {
  const t = createTranslator({ locale: INTL_LOCALES[locale], messages: locale === 'en' ? en : ar }) as unknown as Translator;
  return (text: string | null | undefined) => translateMessage(t, text, INTL_LOCALES[locale]);
};
