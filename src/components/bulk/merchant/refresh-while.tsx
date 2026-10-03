'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Re-renders the page every few seconds — for a booking still in progress
// (e.g. after a refresh mid-booking), until the server says it's done.
const RefreshWhile = ({ seconds = 4 }: { seconds?: number }) => {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
};

export default RefreshWhile;
