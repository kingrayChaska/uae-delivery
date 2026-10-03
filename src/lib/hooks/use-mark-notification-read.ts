'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { markNotificationReadAction } from '@/lib/notifications/actions';

export const useMarkNotificationRead = (notificationId: string, initiallyRead: boolean) => {
  const router = useRouter();
  const [isRead, setIsRead] = useState(initiallyRead);
  const [isMarking, setIsMarking] = useState(false);

  const markRead = async () => {
    if (isRead) return;
    setIsMarking(true);
    const result = await markNotificationReadAction(notificationId);
    setIsMarking(false);
    if (result.success) {
      setIsRead(true);
      router.refresh();
    }
  };

  return { isRead, isMarking, markRead };
};
