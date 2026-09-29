import { cookies } from 'next/headers';

import DashboardNav from '@/components/navigation/dashboard-nav';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { SIDEBAR_COOKIE, isSidebarCollapsed } from '@/lib/navigation';

// Server-side role check — this, not the route path, is what actually
// keeps other roles out of /dashboard/driver/*.
const DriverLayout = async ({ children }: { children: React.ReactNode }) => {
  const profile = await requireRoleOrRedirect('driver');
  const collapsed = isSidebarCollapsed((await cookies()).get(SIDEBAR_COOKIE)?.value);

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30 lg:flex-row">
      <DashboardNav profile={profile} defaultCollapsed={collapsed} />
      {/* min-w-0: lets long content (addresses, tables) truncate or scroll
          instead of stretching the page past the screen on mobile. */}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
};

export default DriverLayout;
