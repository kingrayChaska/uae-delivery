'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { signOutAction } from '@/lib/auth/actions';

export const useSignOut = () => {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async () => {
    setIsSigningOut(true);
    const result = await signOutAction();
    if (result.success && result.redirectTo) {
      router.push(result.redirectTo);
      router.refresh();
    } else {
      setIsSigningOut(false);
    }
  };

  return { signOut, isSigningOut };
};
