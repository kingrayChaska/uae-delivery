'use server';

import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { remittanceDecisionSchema, remittanceSchema } from '@/lib/cash/schemas';

import type { RemittanceDecisionInput, RemittanceInput } from '@/lib/cash/schemas';

export type CashActionResult = { success: true; id: string } | { success: false; error: string };

// Records cash a driver handed over. record_driver_remittance() (migration
// 0042) is the real gate: it re-checks the caller is an operator or manager
// from the session, that the driver exists, that the amount isn't more than
// they owe (less what is already awaiting confirmation), and returns the
// original remittance when the same submission arrives twice. An
// operator's remittance waits for a manager; a manager's counts at once.
// It writes its own audit log row in the same transaction.
export const recordRemittanceAction = async (input: RemittanceInput): Promise<CashActionResult> => {
  await requireRole('operator', 'manager');
  const parsed = remittanceSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'validation.invalid' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('record_driver_remittance', {
    p_driver_id: parsed.data.driverId,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_received_on: parsed.data.receivedOn,
    p_reference: parsed.data.reference || null,
    p_notes: parsed.data.notes || null,
    p_client_request_id: parsed.data.clientRequestId,
  });
  if (error || !data) return { success: false, error: safeErrorMessage(error) };
  return { success: true, id: data as string };
};

// A manager confirms (the cash now reduces the driver's balance) or rejects
// (with a reason; it never counts). Checked again in decide_driver_remittance().
export const decideRemittanceAction = async (input: RemittanceDecisionInput): Promise<CashActionResult> => {
  await requireRole('manager');
  const parsed = remittanceDecisionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'validation.invalid' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('decide_driver_remittance', {
    p_remittance_id: parsed.data.remittanceId,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note || null,
  });
  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true, id: parsed.data.remittanceId };
};
