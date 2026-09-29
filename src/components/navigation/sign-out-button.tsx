'use client';

import { LogOut } from 'lucide-react';

import { useSignOut } from '@/lib/hooks/use-sign-out';
import { cn } from '@/lib/utils';

const SignOutButton = ({ compact = false }: { compact?: boolean }) => {
  const { signOut, isSigningOut } = useSignOut();

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={isSigningOut}
      aria-busy={isSigningOut || undefined}
      title={compact ? 'Sign out' : undefined}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60',
        compact && 'justify-center px-0',
      )}
    >
      <LogOut className="size-5 shrink-0" aria-hidden />
      <span className={cn(compact && 'sr-only')}>{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
    </button>
  );
};

export default SignOutButton;
