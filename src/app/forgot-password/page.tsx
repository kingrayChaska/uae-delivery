import { getTranslations } from 'next-intl/server';

import AuthShell from '@/components/auth/auth-shell';
import ForgotPasswordForm from '@/components/auth/forgot-password-form';
import { getRequestLocale } from '@/i18n/server';
import { localizedAlternates } from '@/lib/seo';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => {
  const [t, locale] = await Promise.all([getTranslations('auth.meta'), getRequestLocale()]);
  return {
    title: t('forgotTitle'),
    alternates: localizedAlternates('/forgot-password', locale),
    robots: { index: false, follow: false },
  };
};

const ForgotPasswordPage = async () => {
  const t = await getTranslations('auth.forgot');
  return (
    <AuthShell title={t('title')}>
      <ForgotPasswordForm />
    </AuthShell>
  );
};

export default ForgotPasswordPage;
