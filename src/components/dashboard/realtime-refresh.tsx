'use client';

import { useRealtimeRefresh } from '@/lib/hooks/use-realtime-refresh';

// Drop into a server-rendered page to re-fetch it when the table changes.
// Supabase Realtime applies the viewer's RLS, so it only fires for rows
// they can read. Each refresh re-reads the page from the database, so an
// out-of-order event can never leave an older status on screen.
const RealtimeRefresh = ({ table, filter }: { table: string; filter?: string }) => {
  useRealtimeRefresh(table, filter);
  return null;
};

export default RealtimeRefresh;
