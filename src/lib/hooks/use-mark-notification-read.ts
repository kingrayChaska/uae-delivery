'use client';

import { useState } from 'react';

import { markNotificationReadAction } from '@/lib/notifications/actions';

export const useMarkNotificationRead = (notificationId: string, initiallyRead: boolean) => {
  const [isRead, setIsRead] = useState(initiallyRead);
  const [isMarking, setIsMarking] = useState(false);

  const markRead = async () => {
    if (isRead) return;
    setIsMarking(true);
    const result = await markNotificationReadAction(notificationId);
    setIsMarking(false);
    if (result.success) setIsRead(true);
  };

  return { isRead, isMarking, markRead };
};
