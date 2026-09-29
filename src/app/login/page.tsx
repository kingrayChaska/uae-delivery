import { getTranslations } from 'next-intl/server';

import AuthShell from '@/components/auth/auth-shell';
import LoginForm from '@/components/auth/login-form';
import FieldError from '@/components/ui/field-error';
import { getRequestLocale } from '@/i18n/server';
import { localizedAlternates } from '@/lib/seo';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => {
  const [t, locale] = await Promise.all([getTranslations('auth.meta'), getRequestLocale()]);
  return {
    title: t('loginTitle'),
    description: t('loginDescription'),
    alternates: localizedAlternates('/login', locale),
  };
};

// Where the proxy and auth callbacks send people with ?error=.
const ERRORS: Record<string, string> = {
  inactive: 'auth.errors.inactive',
  invalid_link: 'auth.errors.invalidLink',
};

const LoginPage = async ({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) => {
  const [t, params] = await Promise.all([getTranslations('auth.login'), searchParams]);
  const error = typeof params.error === 'string' ? ERRORS[params.error] : undefined;

  return (
    <AuthShell title={t('title')}>
      {error ? (
        <div className="w-full max-w-sm">
          <FieldError message={error} />
        </div>
      ) : null}
      <LoginForm />
    </AuthShell>
  );
};

export default LoginPage;
