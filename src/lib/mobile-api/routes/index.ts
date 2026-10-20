import 'server-only';

import { authRoutes } from '@/lib/mobile-api/routes/auth';
import { driverRoutes } from '@/lib/mobile-api/routes/driver';
import { managerRoutes } from '@/lib/mobile-api/routes/manager';
import { notificationRoutes } from '@/lib/mobile-api/routes/notifications';
import { pushRoutes } from '@/lib/mobile-api/routes/push';
import { staffRoutes } from '@/lib/mobile-api/routes/staff';

import type { MobileRoute } from '@/lib/mobile-api/router';

export const MOBILE_ROUTES: readonly MobileRoute[] = [...authRoutes, ...notificationRoutes, ...driverRoutes, ...staffRoutes, ...managerRoutes, ...pushRoutes];
