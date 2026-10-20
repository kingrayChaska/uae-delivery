import { beforeEach, describe, expect, it, vi } from 'vitest';

// The report actions only check the role and pass ids along; the database
// functions (migration 0052) decide everything else.
const role = { current: 'operator' };
const rpc = vi.fn();

vi.mock('@/lib/auth/guards', () => ({
  requireRole: async (...allowed: string[]) => {
    if (!allowed.includes(role.current)) throw new Error('Forbidden');
    return { id: `${role.current}-id`, role: role.current };
  },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }));

const actions = await import('@/lib/finance/expense-report-actions');

const REPORT = '40000000-0000-4000-8000-000000000001';
const REQUEST = '40000000-0000-4000-8000-000000000002';

beforeEach(() => {
  role.current = 'operator';
  rpc.mockReset();
});

describe('operators', () => {
  it('create a report for a period; no operator id is ever sent', async () => {
    rpc.mockResolvedValue({ data: REPORT, error: null });
    expect(await actions.createExpenseReportAction({ kind: 'week', from: '2026-09-07', to: '2026-09-13', requestId: REQUEST })).toEqual({
      success: true,
      id: REPORT,
    });
    expect(rpc).toHaveBeenCalledWith('create_expense_report', { p_kind: 'week', p_start: '2026-09-07', p_end: '2026-09-13', p_request_id: REQUEST });
  });

  it('submit and discard their report', async () => {
    rpc.mockResolvedValue({ data: 'submitted', error: null });
    expect(await actions.submitExpenseReportAction(REPORT)).toEqual({ success: true, id: REPORT, status: 'submitted' });
    expect(rpc).toHaveBeenCalledWith('submit_expense_report', { p_report_id: REPORT });
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await actions.discardExpenseReportAction(REPORT)).toMatchObject({ success: true });
  });

  it('see the database’s reason when a step is refused', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Add at least one expense before submitting this report' } });
    expect(await actions.submitExpenseReportAction(REPORT)).toEqual({ success: false, error: 'errors.db.expenseReportEmpty' });
  });

  it('can’t approve, return or correct', async () => {
    await expect(actions.approveExpenseReportAction({ reportId: REPORT })).rejects.toThrow('Forbidden');
    await expect(actions.returnExpenseReportAction({ reportId: REPORT, reason: 'Missing receipts' })).rejects.toThrow('Forbidden');
    await expect(actions.correctExpenseAction({ expenseId: REPORT, amount: 10, reason: 'Refund received', requestId: REQUEST })).rejects.toThrow('Forbidden');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a bad id never reaches the database', async () => {
    expect(await actions.submitExpenseReportAction('not-a-uuid')).toEqual({ success: false, error: 'errors.notFound' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('managers', () => {
  beforeEach(() => {
    role.current = 'manager';
  });

  it('approve, return with a reason, and correct an approved expense', async () => {
    rpc.mockResolvedValue({ data: 'approved', error: null });
    expect(await actions.approveExpenseReportAction({ reportId: REPORT, note: '' })).toMatchObject({ success: true, status: 'approved' });
    expect(rpc).toHaveBeenCalledWith('approve_expense_report', { p_report_id: REPORT, p_note: null });

    expect(await actions.returnExpenseReportAction({ reportId: REPORT, reason: 'no' })).toEqual({
      success: false,
      error: 'finance.reports.validation.returnReason',
    });
    rpc.mockResolvedValue({ data: 'returned', error: null });
    expect(await actions.returnExpenseReportAction({ reportId: REPORT, reason: 'Missing the fuel receipt' })).toMatchObject({ status: 'returned' });

    rpc.mockResolvedValue({ data: REQUEST, error: null });
    expect(await actions.correctExpenseAction({ expenseId: REPORT, amount: 450, reason: 'Landlord refund', requestId: REQUEST })).toEqual({
      success: true,
      id: REQUEST,
    });
    expect(rpc).toHaveBeenLastCalledWith('correct_expense', { p_expense_id: REPORT, p_amount: 450, p_reason: 'Landlord refund', p_request_id: REQUEST });
  });

  it('can’t prepare or submit an operator’s report', async () => {
    await expect(actions.createExpenseReportAction({ kind: 'week', from: '2026-09-07', to: '2026-09-13', requestId: REQUEST })).rejects.toThrow('Forbidden');
    await expect(actions.submitExpenseReportAction(REPORT)).rejects.toThrow('Forbidden');
  });

  it.each(['driver', 'customer'])('a %s can do nothing here', async (who) => {
    role.current = who;
    await expect(actions.approveExpenseReportAction({ reportId: REPORT })).rejects.toThrow('Forbidden');
    await expect(actions.submitExpenseReportAction(REPORT)).rejects.toThrow('Forbidden');
  });
});
