'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

const DEBOUNCE_MS = 500;

// Used where the client only needs to know "something changed, re-fetch"
// rather than merging individual row events into local state (that finer-
// grained approach is what useRealtimeDriverLocations does instead, since
// location pings are frequent enough that a full page refetch per ping
// would be wasteful).
// filter narrows it to matching rows, in Realtime's syntax (e.g. 'id=eq.<uuid>').
export const useRealtimeRefresh = (table: string, filter?: string) => {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(filter ? `${table}-refresh-${filter}` : `${table}-refresh`)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => router.refresh(), DEBOUNCE_MS);
      })
      .subscribe();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable from Next's app router; re-subscribing on every render identity change would thrash the channel
  }, [table, filter]);
};
