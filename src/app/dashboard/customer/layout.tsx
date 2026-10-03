import { cookies } from 'next/headers';

import DashboardNav from '@/components/navigation/dashboard-nav';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { SIDEBAR_COOKIE, isSidebarCollapsed } from '@/lib/navigation';
import { getUnreadNotificationCountAction } from '@/lib/notifications/actions';

// Server-side role check — this, not the route path, is what actually
// keeps other roles out of /dashboard/customer/*.
const CustomerLayout = async ({ children }: { children: React.ReactNode }) => {
  const profile = await requireRoleOrRedirect('customer');
  const collapsed = isSidebarCollapsed((await cookies()).get(SIDEBAR_COOKIE)?.value);
  const unreadNotificationCount = await getUnreadNotificationCountAction();

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30 lg:flex-row">
      <DashboardNav profile={profile} defaultCollapsed={collapsed} unreadNotificationCount={unreadNotificationCount} />
      {/* min-w-0: lets long content (addresses, tables) truncate or scroll
          instead of stretching the page past the screen on mobile. */}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
};

export default CustomerLayout;
