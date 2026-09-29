import { getTranslations } from 'next-intl/server';

import NotificationsView from '@/components/dashboard/notifications-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listNotificationsAction } from '@/lib/notifications/actions';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('notifications'))('meta'),
});

const CustomerNotificationsPage = async () => {
  await requireRoleOrRedirect('customer');
  const notifications = await listNotificationsAction();
  return <NotificationsView notifications={notifications} audience="customer" />;
};

export default CustomerNotificationsPage;
