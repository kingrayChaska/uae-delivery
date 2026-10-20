import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { ExpenseReportStatus, ExpensePeriodKind, ExpenseReviewState, OperatorExpenseFilters } from '@/lib/finance/expense-reports';
import type { Period, ProfitGroup } from '@/lib/finance/schemas';

// Operator expense reports (migration 0052). Every total is summed by the
// database; who may see what is decided there too (RLS, and each function
// checks the caller): an operator their own, a manager every operator's.

type Numeric = number | string;
const money = (value: Numeric | null | undefined) => (value === null || value === undefined ? null : Number(value));

// Signed links to receipts last ten minutes; storage RLS decides who gets one.
const RECEIPT_LINK_SECONDS = 600;
export const RECEIPT_BUCKET = 'expense-receipts';

export type ExpenseReportSummary = {
  id: string;
  number: string;
  operatorId: string;
  operatorName: string;
  kind: ExpensePeriodKind;
  periodStart: string;
  periodEnd: string;
  status: ExpenseReportStatus;
  total: number;
  expenseCount: number;
  receiptCount: number;
  submittedAt: string | null;
  submissionCount: number;
  submittedTotal: number | null;
  approvedTotal: number | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  createdAt: string;
};

const toSummary = (row: Record<string, unknown>): ExpenseReportSummary => ({
  id: String(row.id),
  number: String(row.report_number),
  operatorId: String(row.operator_id),
  operatorName: String(row.operator_name ?? ''),
  kind: row.period_kind as ExpensePeriodKind,
  periodStart: String(row.period_start),
  periodEnd: String(row.period_end),
  status: row.status as ExpenseReportStatus,
  total: Number(row.total ?? 0),
  expenseCount: Number(row.expense_count ?? 0),
  receiptCount: Number(row.receipt_count ?? 0),
  submittedAt: (row.submitted_at as string | null) ?? null,
  submissionCount: Number(row.submission_count ?? 0),
  submittedTotal: money(row.submitted_total as Numeric | null),
  approvedTotal: money(row.approved_total as Numeric | null),
  decidedAt: (row.decided_at as string | null) ?? null,
  decidedByName: (row.decided_by_name as string | null) ?? null,
  decisionNote: (row.decision_note as string | null) ?? null,
  createdAt: String(row.created_at),
});

// The caller's own reports (operator), or every operator's overlapping a
// period (manager), newest period first.
export const listExpenseReports = async (filter: { period?: Period; status?: ExpenseReportStatus | null } = {}): Promise<ExpenseReportSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('expense_report_list', {
    p_from: filter.period?.from ?? null,
    p_to: filter.period?.to ?? null,
    p_status: filter.status ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toSummary);
};

export type OperatorExpense = {
  id: string;
  categoryId: string;
  categoryName: string;
  description: string;
  amount: number;
  currency: string;
  incurredOn: string;
  paymentStatus: 'paid' | 'unpaid';
  paidOn: string | null;
  vendor: string | null;
  reference: string | null;
  notes: string | null;
  status: 'active' | 'void';
  voidReason: string | null;
  receiptPath: string | null;
  reportId: string | null;
  reportNumber: string | null;
  // The report's status, or 'unreported'.
  state: ExpenseReviewState;
  createdAt: string;
  updatedAt: string;
};

const EXPENSE_COLUMNS =
  'id, category_id, description, amount, currency, incurred_on, payment_status, paid_on, vendor, reference, notes, status, void_reason, receipt_path, report_id, created_at, updated_at, category:expense_categories(name), report:expense_reports(report_number, status)';

const toExpense = (row: Record<string, unknown>): OperatorExpense => {
  const report = row.report as { report_number: string; status: ExpenseReportStatus } | null;
  const category = row.category as { name: string } | null;
  return {
    id: String(row.id),
    categoryId: String(row.category_id),
    categoryName: category?.name ?? '',
    description: String(row.description),
    amount: Number(row.amount),
    currency: String(row.currency),
    incurredOn: String(row.incurred_on),
    paymentStatus: row.payment_status as 'paid' | 'unpaid',
    paidOn: (row.paid_on as string | null) ?? null,
    vendor: (row.vendor as string | null) ?? null,
    reference: (row.reference as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    status: row.status as 'active' | 'void',
    voidReason: (row.void_reason as string | null) ?? null,
    receiptPath: (row.receipt_path as string | null) ?? null,
    reportId: (row.report_id as string | null) ?? null,
    reportNumber: report?.report_number ?? null,
    state: report?.status ?? 'unreported',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
};

export const OPERATOR_EXPENSE_PAGE_SIZE = 50;

// The signed-in operator's own expenses (RLS: an operator reads only theirs).
export const listOperatorExpenses = async (
  operatorId: string,
  filters: OperatorExpenseFilters,
  page = 1,
): Promise<{ rows: OperatorExpense[]; total: number }> => {
  const supabase = await createClient();
  const start = (page - 1) * OPERATOR_EXPENSE_PAGE_SIZE;
  const columns =
    filters.state && filters.state !== 'unreported'
      ? EXPENSE_COLUMNS.replace('report:expense_reports(', 'report:expense_reports!inner(')
      : EXPENSE_COLUMNS;
  let query = supabase
    .from('expenses')
    .select(columns, { count: 'exact' })
    .eq('source', 'operator')
    .eq('created_by', operatorId)
    .gte('incurred_on', filters.from)
    .lte('incurred_on', filters.to)
    .order('incurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .range(start, start + OPERATOR_EXPENSE_PAGE_SIZE - 1);
  if (filters.category) query = query.eq('category_id', filters.category);
  if (filters.state === 'unreported') query = query.is('report_id', null);
  else if (filters.state) query = query.eq('report.status', filters.state);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(toExpense), total: count ?? 0 };
};

export type OperatorTotals = {
  byCategory: { categoryId: string; name: string; total: number; count: number }[];
  byState: Record<ExpenseReviewState, number>;
  total: number;
};

// Summed in the database; folded here by category and by state only.
export const getOperatorExpenseTotals = async ({ from, to }: Period): Promise<OperatorTotals> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_expense_totals', { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { category_id: string; name: string; state: ExpenseReviewState; total: Numeric; expense_count: Numeric }[];
  const fils = (value: Numeric) => Math.round(Number(value) * 100);
  const byCategory = new Map<string, { categoryId: string; name: string; total: number; count: number }>();
  const byState: Record<ExpenseReviewState, number> = { unreported: 0, draft: 0, submitted: 0, approved: 0, returned: 0 };
  let total = 0;
  for (const row of rows) {
    const entry = byCategory.get(row.category_id) ?? { categoryId: row.category_id, name: row.name, total: 0, count: 0 };
    entry.total += fils(row.total);
    entry.count += Number(row.expense_count);
    byCategory.set(row.category_id, entry);
    byState[row.state] += fils(row.total);
    total += fils(row.total);
  }
  return {
    byCategory: [...byCategory.values()].map((c) => ({ ...c, total: c.total / 100 })),
    byState: Object.fromEntries(Object.entries(byState).map(([k, v]) => [k, v / 100])) as Record<ExpenseReviewState, number>,
    total: total / 100,
  };
};

export type ReportEntry = OperatorExpense & {
  receiptUrl: string | null;
  corrections: { originalAmount: number; correctedAmount: number; reason: string; createdAt: string }[];
};

export type ExpenseReportDetail = {
  report: ExpenseReportSummary;
  categories: { categoryId: string; name: string; profitGroup: ProfitGroup; total: number; count: number }[];
  entries: ReportEntry[];
  history: { action: string; actorName: string | null; note: string | null; total: number | null; createdAt: string }[];
};

// One report with everything behind it, or null if the caller can't see it.
export const getExpenseReport = async (reportId: string): Promise<ExpenseReportDetail | null> => {
  const supabase = await createClient();
  const { data: list, error: listError } = await supabase.rpc('expense_report_list', { p_from: null, p_to: null, p_status: null }).eq('id', reportId);
  if (listError) throw new Error(listError.message);
  const row = ((list ?? []) as Record<string, unknown>[])[0];
  if (!row) return null;

  const [categories, entries, history, corrections] = await Promise.all([
    supabase.rpc('expense_report_categories', { p_report_id: reportId }),
    supabase.from('expenses').select(EXPENSE_COLUMNS).eq('report_id', reportId).order('incurred_on').order('created_at'),
    supabase.rpc('expense_report_history', { p_report_id: reportId }),
    supabase.from('expense_corrections').select('expense_id, original_amount, corrected_amount, reason, created_at').eq('report_id', reportId).order('created_at'),
  ]);
  for (const result of [categories, entries, history, corrections]) if (result.error) throw new Error(result.error.message);

  const expenses = ((entries.data ?? []) as unknown as Record<string, unknown>[]).map(toExpense);
  const paths = expenses.map((e) => e.receiptPath).filter((p): p is string => Boolean(p));
  const links = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrls(paths, RECEIPT_LINK_SECONDS);
    for (const item of signed ?? []) if (item.path && item.signedUrl) links.set(item.path, item.signedUrl);
  }
  const fixes = new Map<string, ReportEntry['corrections']>();
  for (const c of (corrections.data ?? []) as { expense_id: string; original_amount: Numeric; corrected_amount: Numeric; reason: string; created_at: string }[]) {
    const list = fixes.get(c.expense_id) ?? [];
    list.push({ originalAmount: Number(c.original_amount), correctedAmount: Number(c.corrected_amount), reason: c.reason, createdAt: c.created_at });
    fixes.set(c.expense_id, list);
  }

  return {
    report: toSummary(row),
    categories: ((categories.data ?? []) as { category_id: string; name: string; profit_group: ProfitGroup; total: Numeric; expense_count: Numeric }[]).map((c) => ({
      categoryId: c.category_id,
      name: c.name,
      profitGroup: c.profit_group,
      total: Number(c.total),
      count: Number(c.expense_count),
    })),
    entries: expenses.map((e) => ({ ...e, receiptUrl: e.receiptPath ? (links.get(e.receiptPath) ?? null) : null, corrections: fixes.get(e.id) ?? [] })),
    history: ((history.data ?? []) as { action: string; actor_name: string | null; note: string | null; total: Numeric | null; created_at: string }[]).map((h) => ({
      action: h.action,
      actorName: h.actor_name,
      note: h.note,
      total: money(h.total),
      createdAt: h.created_at,
    })),
  };
};

export type ExpenseReviewSummary = {
  managerRecorded: number;
  approved: number;
  official: number;
  awaitingReview: number;
  returned: number;
  notSubmitted: number;
  submittedReports: number;
  approvedReports: number;
  returnedReports: number;
  draftReports: number;
};

// Managers: where the period's expenses stand, each counted once.
export const getExpenseReviewSummary = async ({ from, to }: Period): Promise<ExpenseReviewSummary> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('expense_review_summary', { p_from: from, p_to: to }).single();
  if (error || !data) throw new Error(error?.message ?? 'No expense review data');
  const row = data as Record<string, Numeric>;
  return {
    managerRecorded: Number(row.manager_recorded),
    approved: Number(row.approved),
    official: Number(row.official),
    awaitingReview: Number(row.awaiting_review),
    returned: Number(row.returned),
    notSubmitted: Number(row.not_submitted),
    submittedReports: Number(row.submitted_reports),
    approvedReports: Number(row.approved_reports),
    returnedReports: Number(row.returned_reports),
    draftReports: Number(row.draft_reports),
  };
};
