import { getTranslations } from 'next-intl/server';

import AuthShell from '@/components/auth/auth-shell';
import ResetPasswordForm from '@/components/auth/reset-password-form';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations('auth.meta');
  return { title: t('resetTitle'), robots: { index: false, follow: false } };
};

const ResetPasswordPage = async () => {
  const t = await getTranslations('auth.reset');
  return (
    <AuthShell title={t('title')}>
      <ResetPasswordForm />
    </AuthShell>
  );
};

export default ResetPasswordPage;
