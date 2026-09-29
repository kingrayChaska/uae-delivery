'use client';

import { useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import { useMarkNotificationRead } from '@/lib/hooks/use-mark-notification-read';
import { UNKNOWN_SENDER, localizeNotification } from '@/lib/notifications/localize';
import { useFormat } from '@/i18n/hooks';

import type { NotificationRecord } from '@/lib/notifications/actions';

// Stored in English by the database; shown in the reader's language when
// it's a notification we know (lib/notifications/localize.ts).
const useNotificationText = (notification: NotificationRecord) => {
  const t = useTranslations('notifications');
  const format = useFormat();
  const localized = localizeNotification(notification);
  if (!localized) return { title: notification.title, body: notification.body };

  const values = { ...localized.values };
  if (values.sender === UNKNOWN_SENDER) values.sender = t('aCustomer');
  if (values.date) {
    const date = new Date(`${values.date} UTC`);
    if (!Number.isNaN(date.getTime())) values.date = format.calendarDate(date.toISOString().slice(0, 10));
  }
  const key = localized.key as 'booked';
  const title = t(`types.${key}.title`);
  // Merchant decisions carry the manager's note, shown as they wrote it.
  if (localized.key === 'merchantChanges' || localized.key === 'merchantRejected') {
    const action = t(`types.${localized.key}.body`);
    return { title, body: values.note ? `${values.note} ${action}` : action };
  }
  if ((localized.key === 'batchNewBooking' || localized.key === 'batchNewList') && values.date) {
    return { title, body: t(`types.${localized.key}.bodyWithDate`, values) };
  }
  return { title, body: t(`types.${key}.body`, values) };
};

const NotificationItem = ({ notification }: { notification: NotificationRecord }) => {
  const t = useTranslations('notifications');
  const format = useFormat();
  const { title, body } = useNotificationText(notification);
  const { isRead, isMarking, markRead } = useMarkNotificationRead(notification.id, notification.readAt !== null);

  return (
    <Card
      className={isRead ? undefined : 'border-primary/40 bg-secondary/30'}
      onClick={markRead}
      role="button"
      tabIndex={0}
      aria-label={isRead ? undefined : `${title} — ${t('markRead')}`}
    >
      <CardContent className="flex items-start justify-between gap-4 pt-6">
        <div>
          <p className="font-medium">{title}</p>
          {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
          <p className="mt-1 font-brand-mono text-xs text-muted-foreground">{format.dateTime(notification.createdAt)}</p>
        </div>
        {!isRead ? (
          <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-label={isMarking ? t('markingRead') : t('unread')} />
        ) : null}
      </CardContent>
    </Card>
  );
};

export default NotificationItem;
