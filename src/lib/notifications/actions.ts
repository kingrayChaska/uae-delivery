'use server';

import { requireUser } from '@/lib/auth/guards';
import { isUuid } from '@/lib/security/validate';
import { createClient } from '@/lib/supabase/server';

export type NotificationRecord = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export const listNotificationsAction = async (): Promise<NotificationRecord[]> => {
  const profile = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, read_at, created_at')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
};

export const getUnreadNotificationCountAction = async (): Promise<number> => {
  const profile = await requireUser();
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profile.id)
    .is('read_at', null);

  if (error) throw error;
  return count ?? 0;
};

export const markNotificationReadAction = async (notificationId: string): Promise<{ success: boolean }> => {
  if (!isUuid(notificationId)) return { success: false };
  const profile = await requireUser();
  const supabase = await createClient();

  // profile_id = auth.uid() is also enforced by RLS (migration 0009) — the
  // explicit filter here just keeps the intent obvious to read.
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('profile_id', profile.id);

  return { success: !error };
};
