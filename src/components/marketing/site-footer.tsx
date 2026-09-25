import Link from 'next/link';

const FOOTER_LINKS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Services',
    links: [
      { label: 'Same-Day Delivery', href: '#services' },
      { label: 'Business Delivery', href: '#business' },
      { label: 'Bulk Shipments', href: '#services' },
    ],
  },
  {
    heading: 'Customers',
    links: [
      { label: 'Track a Shipment', href: '/tracking' },
      { label: 'Sign In', href: '/login' },
      { label: 'Create Account', href: '/register' },
    ],
  },
  {
    heading: 'Business',
    links: [{ label: 'Partner With Us', href: '#business' }],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
];

const SiteFooter = () => {
  return (
    <footer className="border-t border-brand-ink/10 bg-brand-paper">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-5">
          <div className="md:col-span-1">
            <p className="font-display text-lg font-semibold text-brand-ink">ParcelLink</p>
            <p className="mt-2 text-sm text-brand-ink/55">Reliable delivery across the UAE.</p>
          </div>

          {FOOTER_LINKS.map((group) => (
            <div key={group.heading}>
              <p className="text-sm font-medium text-brand-ink">{group.heading}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-brand-ink/55 hover:text-brand-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-brand-ink/10 pt-6 text-sm text-brand-ink/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ParcelLink. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
