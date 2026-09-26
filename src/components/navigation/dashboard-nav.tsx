'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import Logo from '@/components/brand/logo';
import SignOutButton from '@/components/navigation/sign-out-button';
import { DASHBOARD_HOME, NAV_ITEMS } from '@/lib/types';

import type { Profile } from '@/lib/types';

type DashboardNavProps = {
  profile: Profile;
};

const DashboardNav = ({ profile }: DashboardNavProps) => {
  const pathname = usePathname();
  const items = NAV_ITEMS[profile.role];

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 md:w-56 md:shrink-0 md:flex-col md:flex-nowrap md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-3 md:py-4">
      <div className="flex items-center justify-between gap-2 md:flex-col md:items-stretch">
        <div className="flex flex-col gap-2 px-1">
          <Logo height={28} href={DASHBOARD_HOME[profile.role]} />
          <div>
            <p className="text-sm font-semibold capitalize">{profile.role} Portal</p>
            <p className="truncate text-xs text-muted-foreground">{profile.fullName}</p>
          </div>
        </div>
      </div>

      <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 pb-1 md:order-none md:mx-0 md:mt-4 md:w-auto md:flex-col md:overflow-visible md:px-0 md:pb-0">
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-secondary font-medium text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="md:mt-4">
        <SignOutButton />
      </div>
    </header>
  );
};

export default DashboardNav;
