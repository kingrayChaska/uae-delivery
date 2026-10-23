import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { ExpenseFilters, ExpensePaymentStatus, ProfitGroup } from '@/lib/finance/schemas';
import type { ExpenseReportStatus } from '@/lib/finance/expense-reports';

// Expenses and their categories (migration 0044). Managers only — RLS
// returns nothing to anyone else.

export type ExpenseCategory = { id: string; name: string; profitGroup: ProfitGroup; isSystem: boolean; active: boolean };

export type Expense = {
  id: string;
  categoryId: string;
  categoryName: string;
  description: string;
  amount: number;
  currency: string;
  incurredOn: string;
  paymentStatus: ExpensePaymentStatus;
  paidOn: string | null;
  vendor: string | null;
  reference: string | null;
  notes: string | null;
  status: 'active' | 'void';
  voidReason: string | null;
  voidedAt: string | null;
  createdById: string;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
  // Who recorded it (migration 0052): a manager's own costs, or an
  // operator's — then the report it's in and that report's status.
  source: 'manager' | 'operator';
  reportId: string | null;
  reportNumber: string | null;
  reportStatus: ExpenseReportStatus | null;
};

export const EXPENSE_PAGE_SIZE = 50;

export const listExpenseCategories = async (): Promise<ExpenseCategory[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id, name, profit_group, is_system, active')
    .order('is_system', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; name: string; profit_group: ProfitGroup; is_system: boolean; active: boolean }[]).map((row) => ({
    id: row.id,
    name: row.name,
    profitGroup: row.profit_group,
    isSystem: row.is_system,
    active: row.active,
  }));
};

type ExpenseRow = {
  id: string;
  category_id: string;
  description: string;
  amount: number | string;
  currency: string;
  incurred_on: string;
  payment_status: ExpensePaymentStatus;
  paid_on: string | null;
  vendor: string | null;
  reference: string | null;
  notes: string | null;
  status: 'active' | 'void';
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  category: { name: string } | null;
  creator: { full_name: string | null } | null;
  updater: { full_name: string | null } | null;
  source: 'manager' | 'operator';
  report_id: string | null;
  report: { report_number: string; status: ExpenseReportStatus } | null;
};

export const listExpenses = async (
  filters: ExpenseFilters,
  page = 1,
): Promise<{ rows: Expense[]; total: number }> => {
  const supabase = await createClient();
  const start = (page - 1) * EXPENSE_PAGE_SIZE;
  let query = supabase
    .from('expenses')
    .select(
      'id, category_id, description, amount, currency, incurred_on, payment_status, paid_on, vendor, reference, notes, status, void_reason, voided_at, created_at, updated_at, created_by, category:expense_categories(name), creator:profiles!expenses_created_by_fkey(full_name), updater:profiles!expenses_updated_by_fkey(full_name), source, report_id, report:expense_reports(report_number, status)',
      { count: 'exact' },
    )
    .gte('incurred_on', filters.from)
    .lte('incurred_on', filters.to)
    .order('incurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .range(start, start + EXPENSE_PAGE_SIZE - 1);
  if (filters.category) query = query.eq('category_id', filters.category);
  if (!filters.includeVoid) query = query.eq('status', 'active');

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    rows: ((data ?? []) as unknown as ExpenseRow[]).map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category?.name ?? '',
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      incurredOn: row.incurred_on,
      paymentStatus: row.payment_status,
      paidOn: row.paid_on,
      vendor: row.vendor,
      reference: row.reference,
      notes: row.notes,
      status: row.status,
      voidReason: row.void_reason,
      voidedAt: row.voided_at,
      createdById: row.created_by,
      createdByName: row.creator?.full_name ?? null,
      updatedByName: row.updater?.full_name ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      source: row.source,
      reportId: row.report_id,
      reportNumber: row.report?.report_number ?? null,
      reportStatus: row.report?.status ?? null,
    })),
    total: count ?? 0,
  };
};
