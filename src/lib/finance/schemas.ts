import { z } from '@/lib/zod';
import { SETTLEMENT_METHODS } from '@/lib/finance/statements';
import { MAX_RECEIPTS_PER_EXPENSE, isReceiptPath } from '@/lib/finance/receipt-files';

// Financial reporting (migration 0044). The database computes every amount;
// these only describe what the pages and forms send it. Dates are calendar
// days in Asia/Dubai, as YYYY-MM-DD.

export const MAX_PERIOD_DAYS = 366;
export const MAX_EXPENSE_AMOUNT = 10_000_000;

export const PROFIT_GROUPS = ['fuel', 'subscription', 'salary', 'rent', 'other'] as const;
export type ProfitGroup = (typeof PROFIT_GROUPS)[number];

export const EXPENSE_PAYMENT_STATUSES = ['paid', 'unpaid'] as const;
export type ExpensePaymentStatus = (typeof EXPENSE_PAYMENT_STATUSES)[number];

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && isoDate.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const DAY_MS = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export const todayInDubai = (now: Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(now);

const hasAtMostTwoDecimals = (value: number) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

// ── Periods ───────────────────────────────────────────────────────────────

export type Period = { from: string; to: string };

// The usual reporting periods, from today in Dubai.
export const periodPresets = (today: string) => {
  const [y, m] = today.split('-').map(Number);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const lastMonthStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const lastMonthEnd = addDays(firstOfMonth, -1);
  // Weeks run Monday to Sunday.
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const thisWeekStart = addDays(today, -weekday);
  return {
    lastMonth: { from: lastMonthStart, to: lastMonthEnd },
    lastWeek: { from: addDays(thisWeekStart, -7), to: addDays(thisWeekStart, -1) },
    monthToDate: { from: firstOfMonth, to: today },
  } satisfies Record<string, Period>;
};

// ?from=&to= from a URL. Anything malformed falls back to the current
// month to date; a reversed range is swapped and a long one is shortened to
// a year, so a hand-edited URL can't ask for an unbounded report.
export const parsePeriod = (from: unknown, to: unknown, today: string = todayInDubai()): Period => {
  let start = isIsoDate(from) ? from : null;
  let end = isIsoDate(to) ? to : null;
  if (!start || !end) return periodPresets(today).monthToDate;
  if (start > end) [start, end] = [end, start];
  if (daysBetween(start, end) >= MAX_PERIOD_DAYS) start = addDays(end, -(MAX_PERIOD_DAYS - 1));
  return { from: start, to: end };
};

const periodShape = {
  from: z.string().refine(isIsoDate, 'finance.validation.date'),
  to: z.string().refine(isIsoDate, 'finance.validation.date'),
};

const checkPeriod = (value: Period, ctx: z.RefinementCtx) => {
  if (value.to < value.from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'finance.validation.periodOrder' });
  else if (daysBetween(value.from, value.to) >= MAX_PERIOD_DAYS) ctx.addIssue({ code: 'custom', path: ['to'], message: 'finance.validation.periodTooLong' });
  else if (value.to > todayInDubai()) ctx.addIssue({ code: 'custom', path: ['to'], message: 'finance.validation.periodFuture' });
};

// ── Statements ────────────────────────────────────────────────────────────

export const generateStatementSchema = z
  .object({ businessAccountId: z.string().uuid('finance.validation.merchant'), ...periodShape })
  .superRefine(checkPeriod);
export type GenerateStatementInput = z.infer<typeof generateStatementSchema>;

export const correctStatementSchema = z.object({
  statementId: z.string().uuid(),
  reason: z.string().trim().min(5, 'finance.validation.correctionReason').max(500, 'finance.validation.correctionReason'),
});
export type CorrectStatementInput = z.infer<typeof correctStatementSchema>;

// ── Expenses ──────────────────────────────────────────────────────────────

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : null));

export const expenseSchema = z
  .object({
    categoryId: z.string().uuid('finance.validation.category'),
    description: z.string().trim().min(2, 'finance.validation.description').max(200, 'finance.validation.description'),
    amount: z
      .number({ error: 'finance.validation.amount' })
      .positive('finance.validation.amount')
      .max(MAX_EXPENSE_AMOUNT, 'finance.validation.amountTooLarge')
      .refine(hasAtMostTwoDecimals, 'finance.validation.twoDecimals'),
    incurredOn: z.string().refine(isIsoDate, 'finance.validation.date'),
    paymentStatus: z.enum(EXPENSE_PAYMENT_STATUSES),
    paidOn: z
      .string()
      .optional()
      .transform((value) => (value ? value : null))
      .refine((value) => value === null || isIsoDate(value), 'finance.validation.date'),
    vendor: optionalText(120, 'finance.validation.vendorTooLong'),
    notes: optionalText(1000, 'finance.validation.notesTooLong'),
    // Receipt pictures (migration 0053): files the recorder uploaded through
    // /api/expense-receipts ("<their id>/<file>"), in display order — the
    // expense's whole list. The database checks each one again. Left out on
    // an edit = unchanged. (The typed reference number is no longer taken;
    // one recorded earlier stays on the expense.)
    receipts: z
      .array(
        z.object({
          path: z.string().refine(isReceiptPath, 'finance.validation.receipt'),
          name: z.string().trim().max(200).nullable().optional(),
        }),
      )
      .max(MAX_RECEIPTS_PER_EXPENSE, 'finance.validation.tooManyReceipts')
      .refine((list) => new Set(list.map((r) => r.path)).size === list.length, 'finance.validation.receipt')
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.incurredOn > todayInDubai()) ctx.addIssue({ code: 'custom', path: ['incurredOn'], message: 'finance.validation.expenseFuture' });
    if (value.paymentStatus === 'unpaid' && value.paidOn) ctx.addIssue({ code: 'custom', path: ['paidOn'], message: 'finance.validation.paidOnUnpaid' });
  });
export type ExpenseInput = z.input<typeof expenseSchema>;
export type ExpenseValues = z.output<typeof expenseSchema>;

export const voidExpenseSchema = z.object({
  expenseId: z.string().uuid(),
  reason: z.string().trim().min(5, 'finance.validation.voidReason').max(500, 'finance.validation.voidReason'),
});
export type VoidExpenseInput = z.infer<typeof voidExpenseSchema>;

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(2, 'finance.validation.categoryName').max(60, 'finance.validation.categoryName'),
  profitGroup: z.enum(PROFIT_GROUPS),
});
export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;

export const updateExpenseCategorySchema = expenseCategorySchema.extend({
  categoryId: z.string().uuid(),
  active: z.boolean(),
});
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;

// ── Expense list filters (in the URL) ─────────────────────────────────────

export type ExpenseFilters = Period & { category: string | null; includeVoid: boolean };

export const parseExpenseFilters = (params: { from?: string; to?: string; category?: string; void?: string }): ExpenseFilters => ({
  ...parsePeriod(params.from, params.to),
  category: params.category && z.string().uuid().safeParse(params.category).success ? params.category : null,
  includeVoid: params.void === '1',
});

// ── Rates (migration 0045) ────────────────────────────────────────────────
// Entered as percentages (1.5 = 1.5%), stored as fractions (0.015).
export const financialRatesSchema = z
  .object({
    effectiveFrom: z.string().refine(isIsoDate, 'finance.validation.date'),
    returnChargePercent: z
      .number({ error: 'finance.validation.returnRate' })
      .min(0, 'finance.validation.returnRate')
      .max(100, 'finance.validation.returnRate')
      .refine(hasAtMostTwoDecimals, 'finance.validation.rateDecimals'),
    note: z.string().trim().max(500, 'finance.validation.notesTooLong').optional(),
  })
  .superRefine((value, ctx) => {
    if (isIsoDate(value.effectiveFrom) && value.effectiveFrom < todayInDubai()) {
      ctx.addIssue({ code: 'custom', path: ['effectiveFrom'], message: 'finance.validation.rateBackdated' });
    }
  });
export type FinancialRatesInput = z.infer<typeof financialRatesSchema>;

// 1.5 (%) -> 0.015, exactly: percentages have at most two decimals.
export const percentToRate = (percent: number) => Math.round(percent * 100) / 10000;

// ── Settlements (migration 0045) ──────────────────────────────────────────
export const settlementSchema = z.object({
  statementId: z.string().uuid(),
  amount: z
    .number({ error: 'finance.validation.amount' })
    .positive('finance.validation.amount')
    .max(MAX_EXPENSE_AMOUNT, 'finance.validation.amountTooLarge')
    .refine(hasAtMostTwoDecimals, 'finance.validation.twoDecimals'),
  method: z.enum(SETTLEMENT_METHODS, { error: 'finance.validation.method' }),
  paidOn: z
    .string()
    .refine(isIsoDate, 'finance.validation.date')
    .refine((value) => value <= todayInDubai(), 'finance.validation.paidOnFuture'),
  reference: z.string().trim().max(100, 'finance.validation.referenceTooLong').optional(),
  notes: z.string().trim().max(500, 'finance.validation.notesTooLong').optional(),
  // One per form submission, reused on retries: recorded once.
  clientRequestId: z.string().uuid(),
});
export type SettlementInput = z.infer<typeof settlementSchema>;

export const voidSettlementSchema = z.object({
  settlementId: z.string().uuid(),
  reason: z.string().trim().min(5, 'finance.validation.voidReason').max(500, 'finance.validation.voidReason'),
});
export type VoidSettlementInput = z.infer<typeof voidSettlementSchema>;
