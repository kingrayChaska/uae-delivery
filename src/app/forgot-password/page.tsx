import { getTranslations } from 'next-intl/server';

import AuthShell from '@/components/auth/auth-shell';
import ForgotPasswordForm from '@/components/auth/forgot-password-form';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations('auth.meta');
  return { title: t('forgotTitle') };
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
