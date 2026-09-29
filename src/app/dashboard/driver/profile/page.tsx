import { getTranslations } from 'next-intl/server';

import ProfileForm from '@/components/dashboard/profile-form';
import DriverDetailsCard from '@/components/driver/driver-details-card';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getDriverProfileDetail } from '@/services/drivers/get-driver-profile';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('driver.profile'))('meta'),
});

const DriverProfilePage = async () => {
  const profile = await requireRoleOrRedirect('driver');
  const [detail, t] = await Promise.all([getDriverProfileDetail(profile.id), getTranslations('driver.profile')]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {detail ? <DriverDetailsCard detail={detail} /> : null}
      <ProfileForm email={profile.email} defaultValues={{ fullName: profile.fullName, phone: profile.phone }} />
    </main>
  );
};

export default DriverProfilePage;
