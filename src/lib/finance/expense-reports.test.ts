import { describe, expect, it } from 'vitest';

import {
  createExpenseReportSchema,
  correctExpenseSchema,
  monthOf,
  operatorCanEdit,
  operatorCanSubmit,
  parseOperatorExpenseFilters,
  reportPeriod,
  returnExpenseReportSchema,
  weekOf,
} from '@/lib/finance/expense-reports';

describe('report periods (Asia/Dubai calendar dates)', () => {
  it('a week runs Monday to Sunday, whatever day is picked', () => {
    // 2026-09-07 is a Monday.
    expect(weekOf('2026-09-07')).toEqual({ from: '2026-09-07', to: '2026-09-13' });
    expect(weekOf('2026-09-10')).toEqual({ from: '2026-09-07', to: '2026-09-13' });
    // A Sunday belongs to the week that started six days earlier.
    expect(weekOf('2026-09-13')).toEqual({ from: '2026-09-07', to: '2026-09-13' });
    // A week can straddle two months (and a year end).
    expect(weekOf('2026-12-31')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('a month is its calendar month, month-end and leap days included', () => {
    expect(monthOf('2026-09-15')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthOf('2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(monthOf('2028-02-03')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthOf('2027-02-28')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
  });

  it('a custom range keeps both ends, in order', () => {
    expect(reportPeriod('custom', '2026-09-20', '2026-09-14')).toEqual({ from: '2026-09-14', to: '2026-09-20' });
    expect(reportPeriod('week', '2026-09-10')).toEqual(weekOf('2026-09-10'));
    expect(reportPeriod('month', '2026-09-10')).toEqual(monthOf('2026-09-10'));
  });
});

describe('report forms', () => {
  const requestId = '40000000-0000-4000-8000-000000000001';

  it('refuses a future report and an over-long custom range', () => {
    expect(createExpenseReportSchema.safeParse({ kind: 'week', from: '2999-01-04', to: '2999-01-10', requestId }).success).toBe(false);
    const long = createExpenseReportSchema.safeParse({ kind: 'custom', from: '2026-01-01', to: '2026-06-30', requestId });
    expect(long.success).toBe(false);
    expect(createExpenseReportSchema.safeParse({ kind: 'custom', from: '2026-01-01', to: '2026-03-31', requestId }).success).toBe(true);
  });

  it('a return needs a reason; a correction needs a reason and a valid amount', () => {
    expect(returnExpenseReportSchema.safeParse({ reportId: requestId, reason: 'no' }).success).toBe(false);
    expect(returnExpenseReportSchema.safeParse({ reportId: requestId, reason: 'Missing receipt for fuel' }).success).toBe(true);
    expect(correctExpenseSchema.safeParse({ expenseId: requestId, amount: 10.005, reason: 'Refund received', requestId }).success).toBe(false);
    expect(correctExpenseSchema.safeParse({ expenseId: requestId, amount: 0, reason: 'Refund received', requestId }).success).toBe(false);
    expect(correctExpenseSchema.safeParse({ expenseId: requestId, amount: 450, reason: 'Refund received', requestId }).success).toBe(true);
  });
});

describe('what an operator may do', () => {
  it('edits only unreported, draft or returned expenses; submits drafts and returned reports', () => {
    expect([null, 'draft', 'returned', 'submitted', 'approved'].map((s) => operatorCanEdit(s as never))).toEqual([true, true, true, false, false]);
    expect((['draft', 'returned', 'submitted', 'approved'] as const).map(operatorCanSubmit)).toEqual([true, true, false, false]);
  });

  it('reads filters from the URL, ignoring anything unknown', () => {
    expect(parseOperatorExpenseFilters({ from: '2026-09-01', to: '2026-09-30', state: 'approved', category: 'nope' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      state: 'approved',
      category: null,
    });
    expect(parseOperatorExpenseFilters({ from: '2026-09-01', to: '2026-09-30', state: 'paid' }).state).toBeNull();
  });
});
