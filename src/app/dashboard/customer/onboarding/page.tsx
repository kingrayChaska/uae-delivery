import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import AccountTypeChoice from '@/components/merchant/account-type-choice';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('merchant.onboarding'))('meta'),
});

const OnboardingPage = async () => {
  const profile = await requireRoleOrRedirect('customer');
  if (profile.accountType === 'merchant') redirect('/dashboard/customer/merchant');
  const t = await getTranslations('merchant.onboarding');
  const firstName = profile.fullName.split(' ')[0];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
      <div className="flex flex-col gap-2 text-center">
        <p className="text-sm font-medium text-primary">
          {firstName ? t('welcome', { name: firstName }) : t('welcomeFallback')}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>
      <AccountTypeChoice />
    </main>
  );
};

export default OnboardingPage;
