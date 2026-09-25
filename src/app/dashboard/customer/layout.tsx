import DashboardNav from '@/components/navigation/dashboard-nav';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

// Server-side role check — this, not the route path, is what actually
// keeps other roles out of /dashboard/customer/*.
const CustomerLayout = async ({ children }: { children: React.ReactNode }) => {
  const profile = await requireRoleOrRedirect('customer');

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <DashboardNav profile={profile} />
      {/* min-w-0: lets long content (addresses, tables) truncate or scroll
          instead of stretching the page past the screen on mobile. */}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
};

export default CustomerLayout;
