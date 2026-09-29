'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

// Adds a shadow and stronger background once the page is scrolled, so the
// header separates from the content under it.
const StickyHeader = ({ children }: { children: ReactNode }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-[background-color,box-shadow,border-color] duration-200',
        scrolled
          ? 'border-brand-ink/10 bg-brand-paper/90 shadow-[0_4px_24px_-12px_rgba(29,26,36,0.25)] backdrop-blur-md'
          : 'border-transparent bg-brand-paper',
      )}
    >
      {children}
    </header>
  );
};

export default StickyHeader;
