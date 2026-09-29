import { getTranslations } from 'next-intl/server';

import NotificationsView from '@/components/dashboard/notifications-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listNotificationsAction } from '@/lib/notifications/actions';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('notifications'))('meta'),
});

const ManagerNotificationsPage = async () => {
  await requireRoleOrRedirect('manager');
  const notifications = await listNotificationsAction();
  return <NotificationsView notifications={notifications} audience="staff" />;
};

export default ManagerNotificationsPage;
