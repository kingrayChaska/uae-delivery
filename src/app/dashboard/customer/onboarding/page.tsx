import { redirect } from 'next/navigation';

import AccountTypeChoice from '@/components/merchant/account-type-choice';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Welcome · ParcelLink' };

const OnboardingPage = async () => {
  const profile = await requireRoleOrRedirect('customer');
  if (profile.accountType === 'merchant') redirect('/dashboard/customer/merchant');

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
      <div className="flex flex-col gap-2 text-center">
        <p className="text-sm font-medium text-primary">Welcome to ParcelLink, {profile.fullName.split(' ')[0] || 'there'}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">How will you use ParcelLink?</h1>
        <p className="text-muted-foreground">Choose the account that fits. You can apply to become a merchant later, too.</p>
      </div>
      <AccountTypeChoice />
    </main>
  );
};

export default OnboardingPage;
