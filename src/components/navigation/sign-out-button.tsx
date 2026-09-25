'use client';

import Button from '@/components/ui/button';
import { useSignOut } from '@/lib/hooks/use-sign-out';

const SignOutButton = () => {
  const { signOut, isSigningOut } = useSignOut();

  return (
    <Button variant="ghost" size="sm" onClick={signOut} disabled={isSigningOut}>
      {isSigningOut ? 'Signing out…' : 'Sign out'}
    </Button>
  );
};

export default SignOutButton;
