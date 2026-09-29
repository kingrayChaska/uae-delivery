'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Logo from '@/components/brand/logo';
import LanguageSwitcher from '@/components/i18n/language-switcher';
import { localizeHref } from '@/i18n/config';
import { useAppLocale } from '@/i18n/hooks';

type MobileNavProps = {
  links: { label: string; href: string }[];
};

// A full-height sheet on phones and tablets. Radix gives it focus trapping,
// Escape-to-close and scroll locking.
const MobileNav = ({ links }: MobileNavProps) => {
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');
  const locale = useAppLocale();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={t('openMenu')}
          className="flex size-11 items-center justify-center rounded-xl text-brand-ink transition-colors hover:bg-brand-ink/5 focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none lg:hidden"
        >
          <Menu className="size-6" aria-hidden />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-brand-ink/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 end-0 z-50 flex w-[88vw] max-w-sm flex-col gap-6 overflow-y-auto bg-brand-paper p-5 shadow-2xl duration-300 ease-out data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right rtl:data-[state=open]:slide-in-from-left rtl:data-[state=closed]:slide-out-to-left motion-reduce:animate-none"
        >
          <div className="flex items-center justify-between">
            <Logo height={30} />
            <DialogPrimitive.Close
              aria-label={t('closeMenu')}
              className="flex size-11 items-center justify-center rounded-xl text-brand-ink transition-colors hover:bg-brand-ink/5 focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none"
            >
              <X className="size-6" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Title className="sr-only">{t('menu')}</DialogPrimitive.Title>
          <nav aria-label={t('main')} className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center justify-between rounded-xl px-3 text-lg font-medium text-brand-ink transition-colors hover:bg-brand-ink/5 focus-visible:ring-2 focus-visible:ring-brand-route focus-visible:outline-none"
              >
                {link.label}
                <ArrowRight className="size-4 text-brand-ink/40 rtl:rotate-180" aria-hidden />
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-2">
            <LanguageSwitcher className="mb-2 w-full justify-center [&>button]:flex-1" />
            <Button asChild size="lg" className="bg-brand-route text-brand-paper hover:bg-brand-route/90">
              <Link href={localizeHref('/register', locale)} onClick={() => setOpen(false)}>
                {t('book')}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-brand-ink/15 bg-transparent text-brand-ink">
              <Link href={localizeHref('/login', locale)} onClick={() => setOpen(false)}>
                {t('signIn')}
              </Link>
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default MobileNav;
