'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronsLeft, ChevronsRight, Menu, X } from 'lucide-react';

import Logo from '@/components/brand/logo';
import SignOutButton from '@/components/navigation/sign-out-button';
import { NAV_ICONS } from '@/components/navigation/nav-icons';
import { DASHBOARD_HOME, NAV_SECTIONS } from '@/lib/types';
import { SIDEBAR_COOKIE } from '@/lib/navigation';
import { cn } from '@/lib/utils';

import type { NavSection, Profile } from '@/lib/types';

type DashboardNavProps = {
  profile: Profile;
  // Read from a cookie on the server, so a collapsed sidebar renders
  // collapsed on the first paint instead of jumping after hydration.
  defaultCollapsed?: boolean;
};

const ROLE_LABELS: Record<Profile['role'], string> = {
  customer: 'Customer',
  driver: 'Driver',
  operator: 'Operator',
  manager: 'Manager',
};

// The dashboard home only matches itself; every other item also matches
// its sub-pages (e.g. a shipment's detail page highlights "My Deliveries").
const isActive = (pathname: string, href: string, home: string) =>
  href === home ? pathname === home : pathname === href || pathname.startsWith(`${href}/`);

const NavLinks = ({
  sections,
  pathname,
  home,
  collapsed,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string;
  home: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) => (
  <div className="flex flex-col gap-5">
    {sections.map((section, index) => (
      <div key={section.heading ?? index} className="flex flex-col gap-1">
        {section.heading ? (
          collapsed ? (
            <hr className="mx-3 my-1 border-border" aria-hidden />
          ) : (
            <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {section.heading}
            </p>
          )
        ) : null}
        <ul className="flex flex-col gap-0.5">
          {section.items.map((item) => {
            const active = isActive(pathname, item.href, home);
            const Icon = NAV_ICONS[item.icon];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition-colors duration-150',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    collapsed && 'justify-center px-0',
                    active
                      ? 'bg-secondary font-semibold text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                  )}
                >
                  {/* Active indicator bar */}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200 motion-reduce:transition-none',
                      active ? 'opacity-100' : 'h-0 opacity-0',
                    )}
                  />
                  <Icon
                    className={cn('size-5 shrink-0 transition-colors', active ? 'text-primary' : 'group-hover:text-foreground')}
                    aria-hidden
                  />
                  <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    ))}
  </div>
);

const Identity = ({ profile, collapsed }: { profile: Profile; collapsed: boolean }) => (
  <div className={cn('flex items-center gap-3 rounded-xl bg-muted/60 p-2.5', collapsed && 'justify-center bg-transparent p-0')}>
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
      aria-hidden
    >
      {(profile.fullName || profile.email).charAt(0).toUpperCase()}
    </span>
    <div className={cn('min-w-0', collapsed && 'sr-only')}>
      <p className="truncate text-sm font-semibold">{profile.fullName || profile.email}</p>
      <p className="truncate text-xs text-muted-foreground">
        {profile.role === 'customer' && profile.accountType === 'merchant' ? 'Merchant' : ROLE_LABELS[profile.role]} portal
      </p>
    </div>
  </div>
);

const DashboardNav = ({ profile, defaultCollapsed = false }: DashboardNavProps) => {
  const pathname = usePathname();
  const sections = NAV_SECTIONS[profile.role];
  const home = DASHBOARD_HOME[profile.role];
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the route changes (including via the
  // browser's back button, which doesn't go through onNavigate).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setDrawerOpen(false);
  }

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <>
      {/* Phones and tablets: a top bar and a slide-in drawer. */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
        <Logo height={28} href={home} />
        <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogPrimitive.Trigger asChild>
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Open navigation menu"
            >
              <Menu className="size-6" aria-hidden />
            </button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none lg:hidden" />
            <DialogPrimitive.Content
              className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-xs flex-col gap-5 overflow-y-auto border-r bg-background p-4 shadow-2xl duration-300 ease-out data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left motion-reduce:animate-none lg:hidden"
              aria-describedby={undefined}
            >
              <div className="flex items-center justify-between">
                <Logo height={28} href={home} />
                <DialogPrimitive.Close
                  className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label="Close navigation menu"
                >
                  <X className="size-6" aria-hidden />
                </DialogPrimitive.Close>
              </div>
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <Identity profile={profile} collapsed={false} />
              <nav aria-label="Dashboard" className="flex-1">
                <NavLinks sections={sections} pathname={pathname} home={home} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
              </nav>
              <div className="border-t pt-3">
                <SignOutButton />
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </header>

      {/* Laptops and desktops: a sticky sidebar that can collapse to icons. */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col gap-5 border-r bg-background/95 py-5 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex',
          collapsed ? 'w-[76px] px-3' : 'w-64 px-4',
        )}
      >
        <div className={cn('flex h-9 items-center', collapsed ? 'justify-center' : 'px-1')}>
          {collapsed ? (
            <Link
              href={home}
              aria-label="Dashboard home"
              className="flex size-9 items-center justify-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground"
            >
              P
            </Link>
          ) : (
            <Logo height={30} href={home} />
          )}
        </div>
        <Identity profile={profile} collapsed={collapsed} />
        <nav aria-label="Dashboard" className="-mx-1 flex-1 overflow-y-auto px-1">
          <NavLinks sections={sections} pathname={pathname} home={home} collapsed={collapsed} />
        </nav>
        <div className={cn('flex flex-col gap-1 border-t pt-3', collapsed && 'items-center')}>
          <SignOutButton compact={collapsed} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <ChevronsRight className="size-5" aria-hidden /> : <ChevronsLeft className="size-5" aria-hidden />}
            <span className={cn(collapsed && 'sr-only')}>Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default DashboardNav;
