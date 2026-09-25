import Link from 'next/link';

import Button from '@/components/ui/button';
import MobileNav from '@/components/marketing/mobile-nav';

const NAV_LINKS = [
  { label: 'Services', href: '#services' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Business', href: '#business' },
  { label: 'Tracking', href: '/tracking' },
  { label: 'Pricing', href: '#pricing' },
];

const SiteNav = () => {
  return (
    <header className="relative border-b border-brand-ink/10 bg-brand-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="font-display text-lg font-semibold text-brand-ink">
          ParcelLink
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-brand-ink/70 transition-colors hover:text-brand-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden text-brand-ink hover:bg-brand-ink/5 sm:inline-flex">
            <Link href="/login">Sign In</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-brand-route text-brand-paper hover:bg-brand-route/90"
          >
            <Link href="/register">Get Started</Link>
          </Button>
          <MobileNav links={[...NAV_LINKS, { label: 'Sign In', href: '/login' }]} />
        </div>
      </div>
    </header>
  );
};

export default SiteNav;
