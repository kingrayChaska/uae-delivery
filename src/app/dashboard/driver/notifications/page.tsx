import { getTranslations } from 'next-intl/server';

import NotificationsView from '@/components/dashboard/notifications-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listNotificationsAction } from '@/lib/notifications/actions';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('notifications'))('meta'),
});

const DriverNotificationsPage = async () => {
  await requireRoleOrRedirect('driver');
  const notifications = await listNotificationsAction();
  return <NotificationsView notifications={notifications} audience="driver" />;
};

export default DriverNotificationsPage;
