import { beforeEach, describe, expect, it, vi } from 'vitest';

// Weekly cash remittance actions (migration 0048). The balances and rules
// live in the database functions, covered by database/test/cash-remittances.sql;
// here: who may call each action, what is validated before the database is
// asked, that no driver, operator or manager id is ever sent (the database
// takes it from the session), and that refusals come back in words.

const REMITTANCE = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';

const role = vi.hoisted(() => ({ current: 'driver' as string }));
const rpc = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }));
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async (...allowed: string[]) => {
    if (!allowed.includes(role.current)) throw new Error('Forbidden');
    return { id: 'someone', role: role.current };
  },
}));

const actions = await import('@/lib/cash/remittance-actions');

const submission = { codAmount: '200', feeAmount: '20.50', note: 'Week of deliveries', requestId: REQUEST };
const confirmation = { remittanceId: REMITTANCE, receivedCod: '200', receivedFee: '20.50' };

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: { number: 'DRM-2026-000001', status: 'pending', amount: '220.50' }, error: null });
});

describe('who may do what', () => {
  it.each([
    ['submitDriverRemittanceAction', submission, ['driver']],
    ['confirmDriverRemittanceAction', confirmation, ['operator', 'manager']],
    ['disputeDriverRemittanceAction', { remittanceId: REMITTANCE, reason: 'Nothing handed over' }, ['operator', 'manager']],
    ['submitOperatorRemittanceAction', submission, ['operator']],
    ['confirmOperatorRemittanceAction', confirmation, ['manager']],
    ['disputeOperatorRemittanceAction', { remittanceId: REMITTANCE, reason: 'Nothing handed over' }, ['manager']],
  ] as const)('%s is open to %j only', async (name, input, allowed) => {
    for (const who of ['customer', 'driver', 'operator', 'manager']) {
      role.current = who;
      rpc.mockClear();
      const run = (actions[name] as (value: unknown) => Promise<unknown>)(input);
      if ((allowed as readonly string[]).includes(who)) {
        await expect(run).resolves.toBeTruthy();
      } else {
        await expect(run).rejects.toThrow('Forbidden');
        expect(rpc).not.toHaveBeenCalled();
      }
    }
  });
});

describe('submitting', () => {
  beforeEach(() => {
    role.current = 'driver';
  });

  it('sends the split, the note and the request id — and no driver id', async () => {
    expect(await actions.submitDriverRemittanceAction(submission)).toEqual({
      success: true,
      data: { number: 'DRM-2026-000001', status: 'pending', amount: 220.5 },
    });
    expect(rpc).toHaveBeenCalledWith('submit_driver_remittance', {
      p_cod_amount: 200,
      p_fee_amount: 20.5,
      p_note: 'Week of deliveries',
      p_request_id: REQUEST,
    });
  });

  it('treats an empty category as zero', async () => {
    await actions.submitDriverRemittanceAction({ ...submission, codAmount: '' });
    expect(rpc).toHaveBeenCalledWith('submit_driver_remittance', expect.objectContaining({ p_cod_amount: 0, p_fee_amount: 20.5 }));
  });

  it.each([
    ['negative', '-5'],
    ['three decimals', '1.005'],
    ['an exponent', '1e3'],
    ['Infinity', 'Infinity'],
    ['NaN', 'NaN'],
    ['letters', '2O0'],
  ])('rejects %s', async (_label, codAmount) => {
    expect(await actions.submitDriverRemittanceAction({ ...submission, codAmount })).toEqual({
      success: false,
      error: 'cash.validation.amount',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects nothing to submit', async () => {
    expect(await actions.submitDriverRemittanceAction({ ...submission, codAmount: '0', feeAmount: '0.00' })).toEqual({
      success: false,
      error: 'cash.validation.nothing',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('needs a request id, so a retry can be recognised', async () => {
    expect((await actions.submitDriverRemittanceAction({ ...submission, requestId: 'again' })).success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports "more than you hold" with the amount available', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'This is more COD than you hold: AED 15.00 available' } });
    expect(await actions.submitDriverRemittanceAction(submission)).toEqual({
      success: false,
      error: 'errors.db.cashMoreCod|{"amount":"15.00"}',
    });
  });

  it('operators submit to the manager through their own function', async () => {
    role.current = 'operator';
    await actions.submitOperatorRemittanceAction(submission);
    expect(rpc).toHaveBeenCalledWith('submit_operator_remittance', expect.objectContaining({ p_cod_amount: 200 }));
  });
});

describe('confirming and disputing', () => {
  beforeEach(() => {
    role.current = 'operator';
  });

  it('sends what was counted, per category', async () => {
    rpc.mockResolvedValue({ data: { status: 'discrepancy', number: 'DRM-2026-000002', confirmedAmount: '10.00', countedNumber: 'DRM-2026-000003' }, error: null });
    expect(await actions.confirmDriverRemittanceAction({ remittanceId: REMITTANCE, receivedCod: '0', receivedFee: '10', note: 'Short' })).toEqual({
      success: true,
      data: { status: 'discrepancy', number: 'DRM-2026-000002', confirmedAmount: 10, countedNumber: 'DRM-2026-000003' },
    });
    expect(rpc).toHaveBeenCalledWith('confirm_driver_remittance', {
      p_remittance_id: REMITTANCE,
      p_received_cod: 0,
      p_received_fee: 10,
      p_note: 'Short',
    });
  });

  it('a dispute needs a reason', async () => {
    expect(await actions.disputeDriverRemittanceAction({ remittanceId: REMITTANCE, reason: ' no ' })).toEqual({
      success: false,
      error: 'cash.validation.disputeReason',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never reports success when the database refuses', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'This remittance was already disputed' } });
    expect(await actions.confirmDriverRemittanceAction(confirmation)).toEqual({ success: false, error: 'errors.db.cashAlreadyDisputed' });
  });

  it('managers confirm operators’ remittances through their own function', async () => {
    role.current = 'manager';
    await actions.confirmOperatorRemittanceAction(confirmation);
    expect(rpc).toHaveBeenCalledWith('confirm_operator_remittance', expect.objectContaining({ p_remittance_id: REMITTANCE }));
  });
});
