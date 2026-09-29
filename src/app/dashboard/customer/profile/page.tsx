import { getTranslations } from 'next-intl/server';

import ProfileForm from '@/components/dashboard/profile-form';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('customer.profile'))('meta'),
});

const ProfilePage = async () => {
  const profile = await requireRoleOrRedirect('customer');
  const t = await getTranslations('customer.profile');

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ProfileForm email={profile.email} defaultValues={{ fullName: profile.fullName, phone: profile.phone }} />
    </main>
  );
};

export default ProfilePage;
