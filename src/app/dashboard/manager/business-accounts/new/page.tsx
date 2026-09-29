import { getTranslations } from 'next-intl/server';

import BusinessForm from '@/components/manager/business-form';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const NewBusinessAccountPage = async () => {
  await requireRoleOrRedirect('manager');
  const t = await getTranslations('manager.business');

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('newTitle')}</h1>
      <div className="max-w-2xl">
        <BusinessForm />
      </div>
    </main>
  );
};

export default NewBusinessAccountPage;
