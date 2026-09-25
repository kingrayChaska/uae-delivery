'use client';

import { Card, CardContent } from '@/components/ui/card';
import { useMarkNotificationRead } from '@/lib/hooks/use-mark-notification-read';

import type { NotificationRecord } from '@/lib/notifications/actions';

const NotificationItem = ({ notification }: { notification: NotificationRecord }) => {
  const { isRead, isMarking, markRead } = useMarkNotificationRead(notification.id, notification.readAt !== null);

  return (
    <Card
      className={isRead ? undefined : 'border-primary/40 bg-secondary/30'}
      onClick={markRead}
      role="button"
      tabIndex={0}
    >
      <CardContent className="flex items-start justify-between gap-4 pt-6">
        <div>
          <p className="font-medium">{notification.title}</p>
          {notification.body ? <p className="text-sm text-muted-foreground">{notification.body}</p> : null}
          <p className="mt-1 font-brand-mono text-xs text-muted-foreground">
            {new Date(notification.createdAt).toLocaleString()}
          </p>
        </div>
        {!isRead ? (
          <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-label={isMarking ? 'Marking read' : 'Unread'} />
        ) : null}
      </CardContent>
    </Card>
  );
};

export default NotificationItem;
