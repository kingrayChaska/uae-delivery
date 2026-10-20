import 'server-only';

import { MOBILE_ROLES, fail, ok } from '@/lib/mobile-api/router';
import {
  getUnreadNotificationCountAction,
  listNotificationsAction,
  markNotificationReadAction,
} from '@/lib/notifications/actions';

import type { MobileRoute } from '@/lib/mobile-api/router';

// The website's own notification feed actions — each reads only the
// caller's rows (RLS: profile_id = auth.uid()).
export const notificationRoutes: readonly MobileRoute[] = [
  {
    method: 'GET',
    path: 'notifications',
    access: MOBILE_ROLES,
    handle: async () => ok(await listNotificationsAction()),
  },
  {
    method: 'GET',
    path: 'notifications/unread-count',
    access: MOBILE_ROLES,
    handle: async () => ok({ count: await getUnreadNotificationCountAction() }),
  },
  {
    method: 'POST',
    path: 'notifications/:id/read',
    access: MOBILE_ROLES,
    handle: async ({ params }) => {
      const result = await markNotificationReadAction(params.id);
      return result.success ? ok(result) : fail(404, 'errors.notFound');
    },
  },
];
