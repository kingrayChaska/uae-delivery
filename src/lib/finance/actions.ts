'use server';

import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { isUuid } from '@/lib/security/validate';
import {
  correctStatementSchema,
  expenseCategorySchema,
  expenseSchema,
  financialRatesSchema,
  generateStatementSchema,
  percentToRate,
  settlementSchema,
  updateExpenseCategorySchema,
  voidExpenseSchema,
  voidSettlementSchema,
} from '@/lib/finance/schemas';
import { scheduleStatementEmails } from '@/services/notifications/statement-emails';

import type {
  CorrectStatementInput,
  ExpenseCategoryInput,
  ExpenseInput,
  ExpenseValues,
  FinancialRatesInput,
  GenerateStatementInput,
  SettlementInput,
  UpdateExpenseCategoryInput,
  VoidExpenseInput,
  VoidSettlementInput,
} from '@/lib/finance/schemas';

export type FinanceActionResult = { success: true; id: string } | { success: false; error: string };

const firstIssue = (issues: { message: string }[]) => issues[0]?.message ?? 'validation.invalid';
const DUPLICATE_KEY = '23505';

// ── Merchant statements ───────────────────────────────────────────────────
// These only pass ids and dates along. generate_merchant_statement(),
// publish_merchant_statement() and discard_merchant_statement() (migration
// 0044) re-check that the caller is an active manager, choose which
// shipments qualify, compute every amount from the stored financial
// records, and write their own audit rows. Nothing here — and nothing from
// the browser — decides an amount or which merchant's records are read.

export const generateStatementAction = async (input: GenerateStatementInput): Promise<FinanceActionResult> => {
  await requireRole('manager');
  const parsed = generateStatementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('generate_merchant_statement', {
    p_business_account_id: parsed.data.businessAccountId,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
  });
  if (error || !isUuid(data)) {
    if (error) console.error('Statement could not be generated', error.code, error.message);
    return { success: false, error: safeErrorMessage(error, 'finance.errors.generateFailed') };
  }
  return { success: true, id: data };
};

// A correction is a new draft for the same merchant and period that, once
// published, replaces the statement it corrects (which stays on record).
export const correctStatementAction = async (input: CorrectStatementInput): Promise<FinanceActionResult> => {
  await requireRole('manager');
  const parsed = correctStatementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  const { data: original, error: readError } = await supabase
    .from('merchant_statements')
    .select('business_account_id, period_start, period_end')
    .eq('id', parsed.data.statementId)
    .maybeSingle();
  if (readError || !original) return { success: false, error: 'errors.db.statementNotFound' };

  const { data, error } = await supabase.rpc('generate_merchant_statement', {
    p_business_account_id: original.business_account_id,
    p_from: original.period_start,
    p_to: original.period_end,
    p_supersedes: parsed.data.statementId,
    p_reason: parsed.data.reason,
  });
  if (error || !isUuid(data)) {
    if (error) console.error('Correction could not be generated', error.code, error.message);
    return { success: false, error: safeErrorMessage(error, 'finance.errors.generateFailed') };
  }
  return { success: true, id: data };
};

// Publishing can also queue an email telling the merchant the statement is
// ready (migration 0045). It is sent after the response; who it goes to is
// read from the database by the sender, never taken from this request.
export const publishStatementAction = async (statementId: string, sendEmail = true): Promise<FinanceActionResult> => {
  await requireRole('manager');
  if (!isUuid(statementId)) return { success: false, error: 'errors.db.statementNotFound' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('publish_merchant_statement', { p_statement_id: statementId, p_send_email: sendEmail === true });
  if (error) {
    console.error('Statement could not be published', error.code, error.message);
    return { success: false, error: safeErrorMessage(error, 'finance.errors.publishFailed') };
  }
  if (sendEmail === true) scheduleStatementEmails();
  return { success: true, id: statementId };
};

// ── Settlements (migration 0045) ──────────────────────────────────────────
// record_statement_settlement() decides the direction (from the statement's
// balance), refuses more than is outstanding, returns the original row for
// a repeated submission, notifies the merchant and writes the audit row.

export const recordSettlementAction = async (input: SettlementInput): Promise<FinanceActionResult> => {
  await requireRole('manager');
  const parsed = settlementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('record_statement_settlement', {
    p_statement_id: parsed.data.statementId,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_paid_on: parsed.data.paidOn,
    p_reference: parsed.data.reference || null,
    p_notes: parsed.data.notes || null,
    p_client_request_id: parsed.data.clientRequestId,
  });
  if (error || !isUuid(data)) return { success: false, error: safeErrorMessage(error, 'finance.errors.saveFailed') };
  return { success: true, id: data };
};

export const voidSettlementAction = async (input: VoidSettlementInput): Promise<FinanceActionResult> => {
  await requireRole('manager');
  const parsed = voidSettlementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc('void_statement_settlement', { p_settlement_id: parsed.data.settlementId, p_reason: parsed.data.reason });
  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true, id: parsed.data.settlementId };
};

// ── Rates (migration 0045) ────────────────────────────────────────────────
// set_financial_rates() takes effect from a day on (today or later) and
// never changes a rate already in force, so earlier figures never move.

export const setFinancialRatesAction = async (input: FinancialRatesInput): Promise<FinanceActionResult> => {
  await requireRole('manager');
  const parsed = financialRatesSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_financial_rates', {
    p_effective_from: parsed.data.effectiveFrom,
    p_return_charge_rate: percentToRate(parsed.data.returnChargePercent),
    // The cash-handling charge was removed (migration 0051).
    p_cash_handling_rate: 0,
    p_note: parsed.data.note || null,
  });
  if (error || !isUuid(data)) return { success: false, error: safeErrorMessage(error, 'finance.errors.saveFailed') };
  return { success: true, id: data };
};

export const discardStatementAction = async (statementId: string): Promise<FinanceActionResult> => {
  await requireRole('manager');
  if (!isUuid(statementId)) return { success: false, error: 'errors.db.statementNotFound' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('discard_merchant_statement', { p_statement_id: statementId });
  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true, id: statementId };
};

// ── Expenses ──────────────────────────────────────────────────────────────
// Written with the manager's own session: expenses_insert/update (RLS)
// admit managers only, and the database triggers record who created,
// changed or voided each expense, keep void expenses unchanged, refuse
// deletion and write the audit trail. The column list below is the only
// thing a request can set.

const expenseColumns = (values: ExpenseValues) => ({
  category_id: values.categoryId,
  description: values.description,
  amount: values.amount,
  incurred_on: values.incurredOn,
  payment_status: values.paymentStatus,
  paid_on: values.paymentStatus === 'paid' ? values.paidOn : null,
  vendor: values.vendor,
  reference: values.reference,
  notes: values.notes,
});

export const createExpenseAction = async (input: ExpenseInput): Promise<FinanceActionResult> => {
  const profile = await requireRole('manager');
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expenses')
    .insert({ ...expenseColumns(parsed.data), created_by: profile.id })
    .select('id')
    .single();
  if (error || !data) return { success: false, error: safeErrorMessage(error, 'finance.errors.saveFailed') };
  return { success: true, id: data.id as string };
};

export const updateExpenseAction = async (expenseId: string, input: ExpenseInput): Promise<FinanceActionResult> => {
  await requireRole('manager');
  if (!isUuid(expenseId)) return { success: false, error: 'errors.notFound' };
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expenses')
    .update(expenseColumns(parsed.data))
    .eq('id', expenseId)
    .eq('status', 'active')
    .select('id');
  if (error) return { success: false, error: safeErrorMessage(error, 'finance.errors.saveFailed') };
  if (!data?.length) return { success: false, error: 'finance.errors.expenseNotEditable' };
  return { success: true, id: expenseId };
};

export const voidExpenseAction = async (input: VoidExpenseInput): Promise<FinanceActionResult> => {
  await requireRole('manager');
  const parsed = voidExpenseSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expenses')
    .update({ status: 'void', void_reason: parsed.data.reason })
    .eq('id', parsed.data.expenseId)
    .eq('status', 'active')
    .select('id');
  if (error) return { success: false, error: safeErrorMessage(error) };
  if (!data?.length) return { success: false, error: 'finance.errors.expenseNotEditable' };
  return { success: true, id: parsed.data.expenseId };
};

export const createExpenseCategoryAction = async (input: ExpenseCategoryInput): Promise<FinanceActionResult> => {
  await requireRole('manager');
  const parsed = expenseCategorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expense_categories')
    .insert({ name: parsed.data.name, profit_group: parsed.data.profitGroup })
    .select('id')
    .single();
  if (error?.code === DUPLICATE_KEY) return { success: false, error: 'finance.errors.categoryExists' };
  if (error || !data) return { success: false, error: safeErrorMessage(error, 'finance.errors.saveFailed') };
  return { success: true, id: data.id as string };
};

export const updateExpenseCategoryAction = async (input: UpdateExpenseCategoryInput): Promise<FinanceActionResult> => {
  await requireRole('manager');
  const parsed = updateExpenseCategorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expense_categories')
    .update({ name: parsed.data.name, profit_group: parsed.data.profitGroup, active: parsed.data.active })
    .eq('id', parsed.data.categoryId)
    .select('id');
  if (error?.code === DUPLICATE_KEY) return { success: false, error: 'finance.errors.categoryExists' };
  if (error) return { success: false, error: safeErrorMessage(error, 'finance.errors.saveFailed') };
  if (!data?.length) return { success: false, error: 'errors.notFound' };
  return { success: true, id: parsed.data.categoryId };
};
