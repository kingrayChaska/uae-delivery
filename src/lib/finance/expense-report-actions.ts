'use server';

import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { isUuid } from '@/lib/security/validate';
import {
  approveExpenseReportSchema,
  correctExpenseSchema,
  createExpenseReportSchema,
  returnExpenseReportSchema,
} from '@/lib/finance/expense-reports';

import type {
  ApproveExpenseReportInput,
  CorrectExpenseInput,
  CreateExpenseReportInput,
  ReturnExpenseReportInput,
} from '@/lib/finance/expense-reports';

// Operator expense reports (migration 0052). Each action checks the role,
// then hands the request to a database function that is the real gate: it
// takes the actor from the session (no operator or manager id is sent),
// re-checks the role, locks the report, allows only the transitions the
// report's status permits, records the step and notifies — in one
// transaction — and answers a repeated request with the current state.

export type ExpenseReportResult = { success: true; id: string; status?: string } | { success: false; error: string };

const firstIssue = (issues: { message: string }[]) => issues[0]?.message ?? 'validation.invalid';

// ── Operators ─────────────────────────────────────────────────────────────
export const createExpenseReportAction = async (input: CreateExpenseReportInput): Promise<ExpenseReportResult> => {
  await requireRole('operator');
  const parsed = createExpenseReportSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_expense_report', {
    p_kind: parsed.data.kind,
    p_start: parsed.data.from,
    p_end: parsed.data.to,
    p_request_id: parsed.data.requestId,
  });
  if (error || !isUuid(data)) return { success: false, error: safeErrorMessage(error, 'finance.reports.errors.createFailed') };
  return { success: true, id: data };
};

export const submitExpenseReportAction = async (reportId: string): Promise<ExpenseReportResult> => {
  await requireRole('operator');
  if (!isUuid(reportId)) return { success: false, error: 'errors.notFound' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('submit_expense_report', { p_report_id: reportId });
  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true, id: reportId, status: String(data) };
};

export const discardExpenseReportAction = async (reportId: string): Promise<ExpenseReportResult> => {
  await requireRole('operator');
  if (!isUuid(reportId)) return { success: false, error: 'errors.notFound' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('discard_expense_report', { p_report_id: reportId });
  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true, id: reportId };
};

// ── Managers ──────────────────────────────────────────────────────────────
export const approveExpenseReportAction = async (input: ApproveExpenseReportInput): Promise<ExpenseReportResult> => {
  await requireRole('manager');
  const parsed = approveExpenseReportSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('approve_expense_report', {
    p_report_id: parsed.data.reportId,
    p_note: parsed.data.note || null,
  });
  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true, id: parsed.data.reportId, status: String(data) };
};

export const returnExpenseReportAction = async (input: ReturnExpenseReportInput): Promise<ExpenseReportResult> => {
  await requireRole('manager');
  const parsed = returnExpenseReportSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('return_expense_report', {
    p_report_id: parsed.data.reportId,
    p_reason: parsed.data.reason,
  });
  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true, id: parsed.data.reportId, status: String(data) };
};

export const correctExpenseAction = async (input: CorrectExpenseInput): Promise<ExpenseReportResult> => {
  await requireRole('manager');
  const parsed = correctExpenseSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('correct_expense', {
    p_expense_id: parsed.data.expenseId,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason,
    p_request_id: parsed.data.requestId,
  });
  if (error || !isUuid(data)) return { success: false, error: safeErrorMessage(error, 'finance.errors.saveFailed') };
  return { success: true, id: data };
};
