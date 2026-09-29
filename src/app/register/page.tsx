import { getTranslations } from 'next-intl/server';

import AuthShell from '@/components/auth/auth-shell';
import RegisterForm from '@/components/auth/register-form';
import { getRequestLocale } from '@/i18n/server';
import { localizedAlternates } from '@/lib/seo';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => {
  const [t, locale] = await Promise.all([getTranslations('auth.meta'), getRequestLocale()]);
  return {
    title: t('registerTitle'),
    description: t('registerDescription'),
    alternates: localizedAlternates('/register', locale),
  };
};

const RegisterPage = async () => {
  const t = await getTranslations('auth.register');
  return (
    <AuthShell title={t('title')}>
      <RegisterForm />
    </AuthShell>
  );
};

export default RegisterPage;
