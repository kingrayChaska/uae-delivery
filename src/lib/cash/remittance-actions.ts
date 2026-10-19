'use server';

import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import {
  remittanceConfirmationSchema,
  remittanceDisputeSchema,
  remittanceSubmissionSchema,
} from '@/lib/cash/remittances';

import type {
  ConfirmResult,
  RemittanceConfirmationInput,
  RemittanceDisputeInput,
  RemittanceSubmissionInput,
  SubmitResult,
} from '@/lib/cash/remittances';

// Weekly cash remittance (migration 0048). Each action checks the role
// first, then hands the request to a database function that is the real
// gate: it takes the actor from the session (no driver, operator or
// manager id is ever sent), re-checks the role, locks the balance, refuses
// more than is held, records the decision, notifies and audits — in one
// transaction — and returns the first result for a repeated request.

type Result<T> = { success: true; data: T } | { success: false; error: string };

const firstIssue = (error: { issues: { message: string }[] }) => error.issues[0]?.message ?? 'validation.invalid';

const toSubmitResult = (data: unknown): SubmitResult => {
  const row = (data ?? {}) as Record<string, unknown>;
  return { number: String(row.number ?? ''), status: String(row.status ?? ''), amount: Number(row.amount ?? 0) };
};

const toConfirmResult = (data: unknown): ConfirmResult => {
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    status: row.status === 'discrepancy' ? 'discrepancy' : 'confirmed',
    number: String(row.number ?? ''),
    confirmedAmount: Number(row.confirmedAmount ?? 0),
    countedNumber: (row.countedNumber as string | null | undefined) ?? null,
  };
};

const submit = async (fn: 'submit_driver_remittance' | 'submit_operator_remittance', input: RemittanceSubmissionInput) => {
  const parsed = remittanceSubmissionSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, {
    p_cod_amount: parsed.data.codAmount,
    p_fee_amount: parsed.data.feeAmount,
    p_note: parsed.data.note || null,
    p_request_id: parsed.data.requestId,
  });
  if (error) return { success: false as const, error: safeErrorMessage(error) };
  return { success: true as const, data: toSubmitResult(data) };
};

const confirm = async (fn: 'confirm_driver_remittance' | 'confirm_operator_remittance', input: RemittanceConfirmationInput) => {
  const parsed = remittanceConfirmationSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, {
    p_remittance_id: parsed.data.remittanceId,
    p_received_cod: parsed.data.receivedCod,
    p_received_fee: parsed.data.receivedFee,
    p_note: parsed.data.note || null,
  });
  if (error) return { success: false as const, error: safeErrorMessage(error) };
  return { success: true as const, data: toConfirmResult(data) };
};

const dispute = async (fn: 'dispute_driver_remittance' | 'dispute_operator_remittance', input: RemittanceDisputeInput) => {
  const parsed = remittanceDisputeSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_remittance_id: parsed.data.remittanceId, p_reason: parsed.data.reason });
  if (error) return { success: false as const, error: safeErrorMessage(error) };
  return { success: true as const, data: { status: 'disputed' as const } };
};

// ── Driver → operator ────────────────────────────────────────────────────
export const submitDriverRemittanceAction = async (input: RemittanceSubmissionInput): Promise<Result<SubmitResult>> => {
  await requireRole('driver');
  return submit('submit_driver_remittance', input);
};

// The operator (or a manager) who counted the cash.
export const confirmDriverRemittanceAction = async (input: RemittanceConfirmationInput): Promise<Result<ConfirmResult>> => {
  await requireRole('operator', 'manager');
  return confirm('confirm_driver_remittance', input);
};

export const disputeDriverRemittanceAction = async (input: RemittanceDisputeInput): Promise<Result<{ status: 'disputed' }>> => {
  await requireRole('operator', 'manager');
  return dispute('dispute_driver_remittance', input);
};

// ── Operator → manager ───────────────────────────────────────────────────
export const submitOperatorRemittanceAction = async (input: RemittanceSubmissionInput): Promise<Result<SubmitResult>> => {
  await requireRole('operator');
  return submit('submit_operator_remittance', input);
};

export const confirmOperatorRemittanceAction = async (input: RemittanceConfirmationInput): Promise<Result<ConfirmResult>> => {
  await requireRole('manager');
  return confirm('confirm_operator_remittance', input);
};

export const disputeOperatorRemittanceAction = async (input: RemittanceDisputeInput): Promise<Result<{ status: 'disputed' }>> => {
  await requireRole('manager');
  return dispute('dispute_operator_remittance', input);
};
