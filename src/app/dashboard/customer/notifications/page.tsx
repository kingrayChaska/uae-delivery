import NotificationItem from '@/components/dashboard/notification-item';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listNotificationsAction } from '@/lib/notifications/actions';

const NotificationsPage = async () => {
  await requireRoleOrRedirect('customer');
  const notifications = await listNotificationsAction();

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Notifications</h1>

      {notifications.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No notifications yet</p>
          <p className="text-sm text-muted-foreground">Updates about your deliveries will appear here.</p>
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

export default NotificationsPage;
