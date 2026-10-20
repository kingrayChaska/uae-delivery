import { z } from '@/lib/zod';
import { addDays, isIsoDate, parsePeriod, todayInDubai } from '@/lib/finance/schemas';

import type { Period } from '@/lib/finance/schemas';

// Operator expense reports (migration 0052). The database decides which
// expenses a report holds, whether periods overlap and what each step
// allows; this names the statuses and works out a period's dates the same
// way the database checks them: weeks Monday–Sunday, months calendar
// months, as Asia/Dubai calendar dates.

export const EXPENSE_REPORT_STATUSES = ['draft', 'submitted', 'approved', 'returned'] as const;
export type ExpenseReportStatus = (typeof EXPENSE_REPORT_STATUSES)[number];

export const EXPENSE_PERIOD_KINDS = ['week', 'month', 'custom'] as const;
export type ExpensePeriodKind = (typeof EXPENSE_PERIOD_KINDS)[number];

// An operator expense's review state: not in a report yet ('unreported'),
// or its report's status.
export const EXPENSE_REVIEW_STATES = ['unreported', ...EXPENSE_REPORT_STATUSES] as const;
export type ExpenseReviewState = (typeof EXPENSE_REVIEW_STATES)[number];

export const MAX_CUSTOM_REPORT_DAYS = 93;

// The Monday–Sunday week holding a date.
export const weekOf = (date: string): Period => {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const from = addDays(date, -weekday);
  return { from, to: addDays(from, 6) };
};

// The calendar month holding a date.
export const monthOf = (date: string): Period => {
  const [y, m] = date.split('-').map(Number);
  const from = `${date.slice(0, 7)}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to };
};

// A report's period from what the operator picked: any day of the week or
// month they mean, or both ends of a custom range.
export const reportPeriod = (kind: ExpensePeriodKind, day: string, to?: string): Period => {
  if (kind === 'week') return weekOf(day);
  if (kind === 'month') return monthOf(day);
  return day <= (to ?? day) ? { from: day, to: to ?? day } : { from: to ?? day, to: day };
};

export const createExpenseReportSchema = z
  .object({
    kind: z.enum(EXPENSE_PERIOD_KINDS),
    from: z.string().refine(isIsoDate, 'finance.validation.date'),
    to: z.string().refine(isIsoDate, 'finance.validation.date'),
    requestId: z.string().uuid(),
  })
  .superRefine((value, ctx) => {
    if (!isIsoDate(value.from) || !isIsoDate(value.to)) return;
    if (value.from > todayInDubai()) ctx.addIssue({ code: 'custom', path: ['from'], message: 'finance.reports.validation.future' });
    if (value.to < value.from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'finance.validation.date' });
    const days = (Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86_400_000 + 1;
    if (value.kind === 'custom' && days > MAX_CUSTOM_REPORT_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'finance.reports.validation.customTooLong' });
    }
  });
export type CreateExpenseReportInput = z.infer<typeof createExpenseReportSchema>;

export const returnExpenseReportSchema = z.object({
  reportId: z.string().uuid(),
  reason: z.string().trim().min(5, 'finance.reports.validation.returnReason').max(1000, 'finance.reports.validation.returnReason'),
});
export type ReturnExpenseReportInput = z.infer<typeof returnExpenseReportSchema>;

export const approveExpenseReportSchema = z.object({
  reportId: z.string().uuid(),
  note: z.string().trim().max(1000, 'finance.validation.notesTooLong').optional(),
});
export type ApproveExpenseReportInput = z.infer<typeof approveExpenseReportSchema>;

export const correctExpenseSchema = z.object({
  expenseId: z.string().uuid(),
  amount: z
    .number({ error: 'finance.validation.amount' })
    .positive('finance.validation.amount')
    .max(10_000_000, 'finance.validation.amountTooLarge')
    .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, 'finance.validation.twoDecimals'),
  reason: z.string().trim().min(5, 'finance.reports.validation.correctionReason').max(500, 'finance.reports.validation.correctionReason'),
  requestId: z.string().uuid(),
});
export type CorrectExpenseInput = z.infer<typeof correctExpenseSchema>;

// The operator's Expenses page filters (in the URL).
export type OperatorExpenseFilters = Period & {
  category: string | null;
  state: ExpenseReviewState | null;
};

export const parseOperatorExpenseFilters = (params: { from?: string; to?: string; category?: string; state?: string }): OperatorExpenseFilters => ({
  ...parsePeriod(params.from, params.to),
  category: params.category && z.string().uuid().safeParse(params.category).success ? params.category : null,
  state: (EXPENSE_REVIEW_STATES as readonly string[]).includes(params.state ?? '') ? (params.state as ExpenseReviewState) : null,
});

// The manager's report list filter on Performance Reports.
export const parseReportStatus = (value: unknown): ExpenseReportStatus | null =>
  (EXPENSE_REPORT_STATUSES as readonly string[]).includes(String(value)) ? (value as ExpenseReportStatus) : null;

// What an operator may do with their own report.
export const operatorCanEdit = (status: ExpenseReportStatus | null) => status === null || status === 'draft' || status === 'returned';
export const operatorCanSubmit = (status: ExpenseReportStatus) => status === 'draft' || status === 'returned';
