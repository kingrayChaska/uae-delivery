'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowRight, Menu, X } from 'lucide-react';

import Button from '@/components/ui/button';
import Logo from '@/components/brand/logo';

type MobileNavProps = {
  links: { label: string; href: string }[];
};

// A full-height sheet on phones and tablets. Radix gives it focus trapping,
// Escape-to-close and scroll locking.
const MobileNav = ({ links }: MobileNavProps) => {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="flex size-11 items-center justify-center rounded-xl text-brand-ink transition-colors hover:bg-brand-ink/5 focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none lg:hidden"
        >
          <Menu className="size-6" aria-hidden />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-brand-ink/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-[88vw] max-w-sm flex-col gap-6 bg-brand-paper p-5 shadow-2xl duration-300 ease-out data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right motion-reduce:animate-none"
        >
          <div className="flex items-center justify-between">
            <Logo height={30} />
            <DialogPrimitive.Close
              aria-label="Close menu"
              className="flex size-11 items-center justify-center rounded-xl text-brand-ink transition-colors hover:bg-brand-ink/5 focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none"
            >
              <X className="size-6" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <nav aria-label="Main" className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center justify-between rounded-xl px-3 text-lg font-medium text-brand-ink transition-colors hover:bg-brand-ink/5 focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none"
              >
                {link.label}
                <ArrowRight className="size-4 text-brand-ink/40" aria-hidden />
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-2">
            <Button asChild size="lg" className="bg-brand-route text-brand-paper hover:bg-brand-route/90">
              <Link href="/register" onClick={() => setOpen(false)}>
                Book a delivery
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-brand-ink/15 bg-transparent text-brand-ink">
              <Link href="/login" onClick={() => setOpen(false)}>
                Sign in
              </Link>
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default MobileNav;
