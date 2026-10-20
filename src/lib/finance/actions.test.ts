import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addDays, parsePeriod, periodPresets, todayInDubai } from '@/lib/finance/schemas';

// Financial reporting actions (migration 0044). Amounts, eligibility and
// who may act are the database's (database/test/financial-reporting.sql);
// these tests cover the app's side of the boundary: the role check comes
// first, input is validated before any call, and only ids and dates — never
// an amount, a total or a merchant chosen by anything but the form — are
// sent to the database.

const MERCHANT = 'b0b0b0b0-0000-4000-8000-000000000000';
const STATEMENT = '11111111-1111-4111-8111-111111111111';
const CATEGORY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EXPENSE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const role = vi.hoisted(() => ({ current: 'manager' as string }));
const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const emails = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/services/notifications/statement-emails', () => ({ scheduleStatementEmails: emails }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc, from }) }));
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async (...allowed: string[]) => {
    if (!allowed.includes(role.current)) throw new Error('Forbidden');
    return { id: 'manager-id', role: role.current };
  },
}));

const actions = await import('@/lib/finance/actions');

// A chainable stand-in for supabase.from(...): records what was written.
const writes: { table: string; op: string; values: unknown }[] = [];
const table = (name: string, result: { data: unknown; error: unknown }) => {
  const chain: Record<string, unknown> = {};
  for (const method of ['eq', 'select', 'single', 'maybeSingle']) chain[method] = () => chain;
  chain.insert = (values: unknown) => (writes.push({ table: name, op: 'insert', values }), chain);
  chain.update = (values: unknown) => (writes.push({ table: name, op: 'update', values }), chain);
  chain.then = (resolve: (value: unknown) => void) => resolve(result);
  return chain;
};

const lastMonth = periodPresets(todayInDubai()).lastMonth;

beforeEach(() => {
  role.current = 'manager';
  writes.length = 0;
  rpc.mockReset().mockResolvedValue({ data: STATEMENT, error: null });
  emails.mockReset();
  from.mockReset().mockImplementation((name: string) => table(name, { data: [{ id: EXPENSE }], error: null }));
});

describe('generateStatementAction', () => {
  it('sends only the merchant and the period', async () => {
    const result = await actions.generateStatementAction({ businessAccountId: MERCHANT, ...lastMonth, netAmount: 1 } as never);
    expect(result).toEqual({ success: true, id: STATEMENT });
    expect(rpc).toHaveBeenCalledWith('generate_merchant_statement', {
      p_business_account_id: MERCHANT,
      p_from: lastMonth.from,
      p_to: lastMonth.to,
    });
  });

  it.each(['operator', 'driver', 'customer'])('refuses a %s before touching the database', async (who) => {
    role.current = who;
    await expect(actions.generateStatementAction({ businessAccountId: MERCHANT, ...lastMonth })).rejects.toThrow('Forbidden');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ businessAccountId: 'not-a-uuid', ...lastMonth }, 'finance.validation.merchant'],
    [{ businessAccountId: MERCHANT, from: lastMonth.to, to: lastMonth.from }, 'finance.validation.periodOrder'],
    [{ businessAccountId: MERCHANT, from: '2024-01-01', to: lastMonth.to }, 'finance.validation.periodTooLong'],
    [{ businessAccountId: MERCHANT, from: todayInDubai(), to: addDays(todayInDubai(), 1) }, 'finance.validation.periodFuture'],
    [{ businessAccountId: MERCHANT, from: '2026-02-30', to: '2026-03-01' }, 'finance.validation.date'],
  ])('validates %o', async (input, error) => {
    expect(await actions.generateStatementAction(input)).toEqual({ success: false, error });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('turns the database’s refusals into readable messages', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'A published statement already covers part of this period' } });
    expect(await actions.generateStatementAction({ businessAccountId: MERCHANT, ...lastMonth })).toEqual({
      success: false,
      error: 'errors.db.statementOverlap',
    });
  });
});

describe('publish, discard and correct', () => {
  it('publish passes only the statement id and the email choice, and sends the email after', async () => {
    rpc.mockResolvedValue({ data: 'STM-2026-000001', error: null });
    expect(await actions.publishStatementAction(STATEMENT)).toEqual({ success: true, id: STATEMENT });
    expect(rpc).toHaveBeenCalledWith('publish_merchant_statement', { p_statement_id: STATEMENT, p_send_email: true });
    expect(emails).toHaveBeenCalledTimes(1);
  });

  it('publishing without email queues and sends nothing', async () => {
    rpc.mockResolvedValue({ data: 'STM-2026-000001', error: null });
    await actions.publishStatementAction(STATEMENT, false);
    expect(rpc).toHaveBeenCalledWith('publish_merchant_statement', { p_statement_id: STATEMENT, p_send_email: false });
    expect(emails).not.toHaveBeenCalled();
  });

  it('a failed publish sends no email', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Only a draft statement can be published' } });
    expect(await actions.publishStatementAction(STATEMENT)).toEqual({ success: false, error: 'errors.db.statementNotDraft' });
    expect(emails).not.toHaveBeenCalled();
  });

  it('refuses a malformed id without calling the database', async () => {
    expect(await actions.publishStatementAction('../x')).toEqual({ success: false, error: 'errors.db.statementNotFound' });
    expect(await actions.discardStatementAction('1 or 1=1')).toEqual({ success: false, error: 'errors.db.statementNotFound' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['operator', 'customer'])('a %s can neither publish nor discard', async (who) => {
    role.current = who;
    await expect(actions.publishStatementAction(STATEMENT)).rejects.toThrow('Forbidden');
    await expect(actions.discardStatementAction(STATEMENT)).rejects.toThrow('Forbidden');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a correction reuses the original’s merchant and period, and needs a reason', async () => {
    expect(await actions.correctStatementAction({ statementId: STATEMENT, reason: 'no' })).toEqual({
      success: false,
      error: 'finance.validation.correctionReason',
    });
    from.mockImplementation((name: string) =>
      table(name, { data: { business_account_id: MERCHANT, period_start: '2026-01-01', period_end: '2026-01-31' }, error: null }),
    );
    rpc.mockResolvedValue({ data: '33333333-3333-4333-8333-333333333333', error: null });
    expect(await actions.correctStatementAction({ statementId: STATEMENT, reason: 'Fee corrected' })).toMatchObject({ success: true });
    expect(rpc).toHaveBeenCalledWith('generate_merchant_statement', {
      p_business_account_id: MERCHANT,
      p_from: '2026-01-01',
      p_to: '2026-01-31',
      p_supersedes: STATEMENT,
      p_reason: 'Fee corrected',
    });
  });
});

describe('expenses', () => {
  const expense = {
    categoryId: CATEGORY,
    description: 'Fleet fuel',
    amount: 500,
    incurredOn: '2026-01-31',
    paymentStatus: 'paid' as const,
    paidOn: '2026-02-01',
  };

  it('writes only the expense’s own columns; who and when come from the database', async () => {
    expect(await actions.createExpenseAction({ ...expense, status: 'void', created_by: 'someone-else' } as never)).toMatchObject({ success: true });
    expect(writes).toEqual([
      {
        table: 'expenses',
        op: 'insert',
        values: {
          category_id: CATEGORY,
          description: 'Fleet fuel',
          amount: 500,
          incurred_on: '2026-01-31',
          payment_status: 'paid',
          paid_on: '2026-02-01',
          vendor: null,
          reference: null,
          notes: null,
          created_by: 'manager-id',
        },
      },
    ]);
  });

  it('an unpaid expense has no payment date', async () => {
    expect(await actions.createExpenseAction({ ...expense, paymentStatus: 'unpaid' })).toEqual({
      success: false,
      error: 'finance.validation.paidOnUnpaid',
    });
    expect(await actions.createExpenseAction({ ...expense, paymentStatus: 'unpaid', paidOn: undefined })).toMatchObject({ success: true });
  });

  it.each([
    [{ amount: 0 }, 'finance.validation.amount'],
    [{ amount: 10.005 }, 'finance.validation.twoDecimals'],
    [{ amount: 20_000_000 }, 'finance.validation.amountTooLarge'],
    [{ description: 'x' }, 'finance.validation.description'],
    [{ incurredOn: addDays(todayInDubai(), 2) }, 'finance.validation.expenseFuture'],
  ])('validates %o', async (change, error) => {
    expect(await actions.createExpenseAction({ ...expense, ...change })).toEqual({ success: false, error });
    expect(writes).toEqual([]);
  });

  it('voiding needs a reason and only marks the expense void', async () => {
    expect(await actions.voidExpenseAction({ expenseId: EXPENSE, reason: 'dup' })).toEqual({ success: false, error: 'finance.validation.voidReason' });
    expect(await actions.voidExpenseAction({ expenseId: EXPENSE, reason: 'Entered twice' })).toMatchObject({ success: true });
    expect(writes).toEqual([{ table: 'expenses', op: 'update', values: { status: 'void', void_reason: 'Entered twice' } }]);
  });

  it('a void expense can no longer be edited', async () => {
    from.mockImplementation((name: string) => table(name, { data: [], error: null }));
    expect(await actions.updateExpenseAction(EXPENSE, expense)).toEqual({ success: false, error: 'finance.errors.expenseNotEditable' });
  });

  it('a duplicate category name is reported as such', async () => {
    from.mockImplementation((name: string) => table(name, { data: null, error: { code: '23505', message: 'duplicate key' } }));
    expect(await actions.createExpenseCategoryAction({ name: 'Marketing', profitGroup: 'other' })).toEqual({
      success: false,
      error: 'finance.errors.categoryExists',
    });
  });

  it.each(['operator', 'driver', 'customer'])('a %s can’t record expenses or categories', async (who) => {
    role.current = who;
    await expect(actions.createExpenseAction(expense)).rejects.toThrow('Forbidden');
    await expect(actions.createExpenseCategoryAction({ name: 'Bonus', profitGroup: 'salary' })).rejects.toThrow('Forbidden');
    expect(writes).toEqual([]);
  });
});

describe('settlements', () => {
  const payment = {
    statementId: STATEMENT,
    amount: 5000,
    method: 'bank_transfer' as const,
    paidOn: '2026-02-05',
    reference: 'TRF-1',
    clientRequestId: '22222222-0000-4000-8000-000000000001',
  };

  it('sends the payment, never a direction or balance', async () => {
    rpc.mockResolvedValue({ data: EXPENSE, error: null });
    expect(await actions.recordSettlementAction({ ...payment, direction: 'from_merchant', balance: 0 } as never)).toEqual({ success: true, id: EXPENSE });
    expect(rpc).toHaveBeenCalledWith('record_statement_settlement', {
      p_statement_id: STATEMENT,
      p_amount: 5000,
      p_method: 'bank_transfer',
      p_paid_on: '2026-02-05',
      p_reference: 'TRF-1',
      p_notes: null,
      p_client_request_id: payment.clientRequestId,
    });
  });

  it.each([
    [{ amount: -1 }, 'finance.validation.amount'],
    [{ amount: 1.001 }, 'finance.validation.twoDecimals'],
    [{ method: 'crypto' }, 'finance.validation.method'],
    [{ paidOn: addDays(todayInDubai(), 1) }, 'finance.validation.paidOnFuture'],
  ])('validates %o', async (change, error) => {
    expect(await actions.recordSettlementAction({ ...payment, ...change } as never)).toEqual({ success: false, error });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports an overpayment the database refused', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'This is more than is outstanding on the statement (AED 3150.00)' } });
    const result = await actions.recordSettlementAction(payment);
    expect(result).toMatchObject({ success: false });
    expect(result.success ? '' : result.error).toContain('errors.db.settlementTooLarge');
  });

  it('voiding needs a reason', async () => {
    expect(await actions.voidSettlementAction({ settlementId: EXPENSE, reason: 'no' })).toEqual({ success: false, error: 'finance.validation.voidReason' });
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await actions.voidSettlementAction({ settlementId: EXPENSE, reason: 'Transfer bounced' })).toMatchObject({ success: true });
    expect(rpc).toHaveBeenCalledWith('void_statement_settlement', { p_settlement_id: EXPENSE, p_reason: 'Transfer bounced' });
  });

  it.each(['operator', 'customer'])('a %s can’t record or void payments', async (who) => {
    role.current = who;
    await expect(actions.recordSettlementAction(payment)).rejects.toThrow('Forbidden');
    await expect(actions.voidSettlementAction({ settlementId: EXPENSE, reason: 'Transfer bounced' })).rejects.toThrow('Forbidden');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('rates', () => {
  // Migration 0051: there is no cash-handling charge, so none is ever sent.
  it('sends the return rate as an exact fraction, and no cash-handling charge', async () => {
    rpc.mockResolvedValue({ data: EXPENSE, error: null });
    await actions.setFinancialRatesAction({ effectiveFrom: todayInDubai(), returnChargePercent: 40 });
    expect(rpc).toHaveBeenCalledWith('set_financial_rates', {
      p_effective_from: todayInDubai(),
      p_return_charge_rate: 0.4,
      p_cash_handling_rate: 0,
      p_note: null,
    });
  });

  it.each([
    [{ effectiveFrom: addDays(todayInDubai(), -1) }, 'finance.validation.rateBackdated'],
    [{ returnChargePercent: 120 }, 'finance.validation.returnRate'],
    [{ returnChargePercent: 40.555 }, 'finance.validation.rateDecimals'],
  ])('validates %o', async (change, error) => {
    expect(await actions.setFinancialRatesAction({ effectiveFrom: todayInDubai(), returnChargePercent: 50, ...change })).toEqual({
      success: false,
      error,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('only managers set rates', async () => {
    role.current = 'operator';
    await expect(actions.setFinancialRatesAction({ effectiveFrom: todayInDubai(), returnChargePercent: 50 })).rejects.toThrow('Forbidden');
  });
});

describe('periods', () => {
  it('presets', () => {
    expect(periodPresets('2026-10-13')).toEqual({
      lastMonth: { from: '2026-09-01', to: '2026-09-30' },
      // 13 Oct 2026 is a Tuesday: last week is Mon 5 – Sun 11 Oct.
      lastWeek: { from: '2026-10-05', to: '2026-10-11' },
      monthToDate: { from: '2026-10-01', to: '2026-10-13' },
    });
    expect(periodPresets('2026-01-05').lastMonth).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('parses URL periods safely', () => {
    expect(parsePeriod('2026-01-01', '2026-01-31', '2026-10-13')).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(parsePeriod('2026-01-31', '2026-01-01', '2026-10-13')).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(parsePeriod('nope', null, '2026-10-13')).toEqual({ from: '2026-10-01', to: '2026-10-13' });
    expect(parsePeriod('2020-01-01', '2026-01-31', '2026-10-13')).toEqual({ from: '2025-01-31', to: '2026-01-31' });
  });
});
