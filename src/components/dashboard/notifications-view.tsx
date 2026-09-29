import { getTranslations } from 'next-intl/server';

import NotificationItem from '@/components/dashboard/notification-item';

import type { NotificationRecord } from '@/lib/notifications/actions';

type NotificationsViewProps = {
  notifications: NotificationRecord[];
  // What this person's notifications are about, for the empty state.
  audience: 'customer' | 'driver' | 'staff';
};

const EMPTY_HINT = { customer: 'emptyCustomer', driver: 'emptyDriver', staff: 'emptyStaff' } as const;

// The notifications page for every role.
const NotificationsView = async ({ notifications, audience }: NotificationsViewProps) => {
  const t = await getTranslations('notifications');

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {notifications.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('emptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t(EMPTY_HINT[audience])}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
          ))}
        </div>
      )}
    </main>
  );
};

export default NotificationsView;
