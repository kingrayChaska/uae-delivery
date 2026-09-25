import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export type AuditLogEntry = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
};

// audit_logs has no INSERT policy for 'authenticated' at all (migration
// 0010) — this is the only way a row gets in, and it's only ever called
// from server actions that have already run requireRole('operator',
// 'manager') themselves. A failed audit write is logged but never blocks
// the underlying action — losing an audit trail entry is bad, but
// blocking a real dispatch/reconciliation action because of it would be
// worse.
export const logAuditEvent = async (entry: AuditLogEntry): Promise<void> => {
  const admin = createAdminClient();

  const { error } = await admin.from('audit_logs').insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
  });

  if (error) {
    console.error('Failed to write audit log entry', entry.action, error.message);
  }
};
