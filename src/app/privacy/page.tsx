import { getTranslations } from 'next-intl/server';

import LanguageSwitcher from '@/components/i18n/language-switcher';
import { getRequestLocale } from '@/i18n/server';
import { localizedAlternates } from '@/lib/seo';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => {
  const [t, locale] = await Promise.all([getTranslations('legal.privacy'), getRequestLocale()]);
  return { title: `${t('title')} — ParcelLink`, alternates: localizedAlternates('/privacy', locale) };
};

// Placeholder — real privacy policy copy is a legal/business decision, not
// something to fabricate. Replace before launch (in both languages:
// messages/en/legal.json and messages/ar/legal.json).
const PrivacyPage = async () => {
  const t = await getTranslations('legal.privacy');
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="absolute inset-e-4 top-4">
        <LanguageSwitcher />
      </div>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('notPublished')}</p>
    </main>
  );
};

export default PrivacyPage;
