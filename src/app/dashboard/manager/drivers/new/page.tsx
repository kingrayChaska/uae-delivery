import { getTranslations } from 'next-intl/server';

import CreateStaffForm from '@/components/manager/create-staff-form';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const NewDriverPage = async () => {
  await requireRoleOrRedirect('manager');
  const t = await getTranslations('manager.staff');

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('addDriverTitle')}</h1>
      <CreateStaffForm role="driver" />
    </main>
  );
};

export default NewDriverPage;
