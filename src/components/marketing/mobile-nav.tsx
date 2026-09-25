'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

type MobileNavProps = {
  links: { label: string; href: string }[];
};

const MobileNav = ({ links }: MobileNavProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="flex size-9 items-center justify-center rounded-md text-brand-ink hover:bg-brand-ink/5"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {open ? (
        <nav className="absolute inset-x-0 top-full flex flex-col gap-1 border-b border-brand-ink/10 bg-brand-paper px-6 py-4">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2 text-brand-ink/80 hover:bg-brand-ink/5"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
};

export default MobileNav;
