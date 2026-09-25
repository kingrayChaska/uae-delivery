'use server';

import { requireRole } from '@/lib/auth/guards';
import { isUuid } from '@/lib/security/validate';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { logAuditEvent } from '@/lib/audit/log';

export type CodActionResult = { success: true } | { success: false; error: string };

export const reconcileCodAction = async (codTransactionId: string): Promise<CodActionResult> => {
  if (!isUuid(codTransactionId)) return { success: false, error: 'Not found' };
  const profile = await requireRole('operator', 'manager');
  const supabase = await createClient();

  const { error } = await supabase
    .from('cod_transactions')
    .update({ status: 'reconciled', reconciled_by: profile.id, reconciled_at: new Date().toISOString() })
    .eq('id', codTransactionId)
    .eq('status', 'collected');

  if (error) return { success: false, error: safeErrorMessage(error) };

  await logAuditEvent({
    actorId: profile.id,
    action: 'cod.reconcile',
    entityType: 'cod_transaction',
    entityId: codTransactionId,
  });

  return { success: true };
};

export const remitCodAction = async (codTransactionId: string): Promise<CodActionResult> => {
  if (!isUuid(codTransactionId)) return { success: false, error: 'Not found' };
  const profile = await requireRole('operator', 'manager');
  const supabase = await createClient();

  const { error } = await supabase
    .from('cod_transactions')
    .update({ status: 'remitted' })
    .eq('id', codTransactionId)
    .eq('status', 'reconciled');

  if (error) return { success: false, error: safeErrorMessage(error) };

  await logAuditEvent({
    actorId: profile.id,
    action: 'cod.remit',
    entityType: 'cod_transaction',
    entityId: codTransactionId,
  });

  return { success: true };
};
