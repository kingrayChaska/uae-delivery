'use client';

import { useEffect, useRef } from 'react';

import { useToast } from '@/components/ui/toaster';

import type { ToastOptions } from '@/components/ui/toaster';

// Raises a toast once when a server-rendered page shows an outcome (e.g.
// "Unable to generate all labels"), alongside the page's own message.
const ToastOnMount = ({ type, message }: Pick<ToastOptions, 'type' | 'message'>) => {
  const toast = useToast();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.show({ type, message });
  }, [toast, type, message]);
  return null;
};

export default ToastOnMount;
