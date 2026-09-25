import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type AuditLogRecord = {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
};

// RLS (audit_logs_select) already restricts this to staff — no additional
// filtering needed here.
export const listAuditLogs = async (limit = 100): Promise<AuditLogRecord[]> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, created_at, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const actor = row.profiles as unknown as { full_name: string } | null;
    return {
      id: row.id,
      actorName: actor?.full_name ?? null,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
    };
  });
};
