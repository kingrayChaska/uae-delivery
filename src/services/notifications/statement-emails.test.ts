import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderStatementEmail, statementEmailUrl } from '@/lib/notifications/statement-email';

// The "statement ready" email (migration 0045). The service-role client is
// faked; the real sendEmail runs against a stubbed fetch, so what is checked
// is the request Resend would actually receive.

const OUTBOX_ID = '5e5f6a7b-8c9d-4e0f-8a1b-2c3d4e5f6a7b';
const STATEMENT_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-13T09:00:00Z');

type Call = { table: string; op: 'select' | 'update'; patch?: Record<string, unknown>; filters: [string, unknown][] };
type Result = { data: unknown; error: { code: string } | null };

const db = vi.hoisted(() => ({
  calls: [] as Call[],
  claimed: [] as Record<string, unknown>[],
  resolve: (() => ({ data: null, error: null })) as (call: Call) => Result,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] };
      const run = () => {
        db.calls.push(call);
        return Promise.resolve(db.resolve(call));
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        update: (patch: Record<string, unknown>) => ((call.op = 'update'), (call.patch = patch), builder),
        eq: (column: string, value: unknown) => (call.filters.push([column, value]), builder),
        lt: () => builder,
        gte: () => builder,
        maybeSingle: run,
        then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => run().then(resolve, reject),
      };
      return builder;
    },
    rpc: () => Promise.resolve({ data: db.claimed, error: null }),
  }),
}));

const { processStatementEmails, statementRecipients } = await import('@/services/notifications/statement-emails');

const statementRow = {
  id: STATEMENT_ID,
  statement_number: 'STM-2026-000001',
  status: 'published',
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  business_account_id: 'b0b0b0b0-0000-4000-8000-000000000000',
  merchant: { name: 'Bravo Goods' },
};

const members = [
  { profile: { email: 'Owner@Bravo.test', active: true, deleted_at: null } },
  { profile: { email: 'left@bravo.test', active: false, deleted_at: null } },
  { profile: { email: 'gone@bravo.test', active: true, deleted_at: '2026-01-01' } },
];

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('EMAIL_FROM', 'ParcelLink <notifications@parcellink.test>');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://parcellink.test');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }));
  db.calls = [];
  db.claimed = [{ id: OUTBOX_ID, statement_id: STATEMENT_ID, attempts: 1, created_at: '2026-10-13T08:59:00Z' }];
  db.resolve = (call) => {
    if (call.table === 'merchant_statements') return { data: statementRow, error: null };
    if (call.table === 'business_accounts') return { data: { contact_email: 'accounts@bravo.test' }, error: null };
    if (call.table === 'business_account_members') return { data: members, error: null };
    if (call.table === 'merchant_statement_emails' && call.op === 'update') return { data: [{ id: OUTBOX_ID }], error: null };
    return { data: null, error: null };
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('renderStatementEmail', () => {
  const content = renderStatementEmail({
    statementId: STATEMENT_ID,
    statementNumber: 'STM-2026-000001',
    merchantName: 'Bravo Goods',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
  });

  it('names the statement and period, in English and Arabic', () => {
    expect(content.subject).toBe('Your ParcelLink account statement STM-2026-000001 is ready');
    expect(content.text).toContain('1 September 2026 – 30 September 2026');
    expect(content.arabic.text).toContain('STM-2026-000001');
    expect(content.arabic.actionLabel).toBe('عرض الكشف');
  });

  it('contains no amounts', () => {
    expect(`${content.text} ${content.arabic.text}`).not.toMatch(/AED|\d+\.\d{2}|درهم/);
  });

  it('links to the signed-in page, never a file', () => {
    expect(statementEmailUrl('https://parcellink.test/', STATEMENT_ID)).toBe(`https://parcellink.test/dashboard/customer/statements/${STATEMENT_ID}`);
  });
});

describe('statementRecipients', () => {
  it('uses the contact email and members’ emails, once each, valid only', () => {
    expect(statementRecipients('Accounts@Bravo.test', ['accounts@bravo.test', 'owner@bravo.test', null, 'not-an-email'])).toEqual([
      'accounts@bravo.test',
      'owner@bravo.test',
    ]);
  });
});

describe('processStatementEmails', () => {
  it('emails the business contact and active members, and records the outcome', async () => {
    expect(await processStatementEmails({ now: () => NOW })).toEqual({ processed: 1, accepted: 1, retrying: 0, failed: 0 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.to).toEqual(['accounts@bravo.test', 'owner@bravo.test']);
    expect(body.subject).toContain('STM-2026-000001');
    expect(body.html).toContain(`/dashboard/customer/statements/${STATEMENT_ID}`);
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe(`statement-email/${OUTBOX_ID}`);
    const recorded = db.calls.find((call) => call.op === 'update' && call.patch?.status === 'accepted');
    expect(recorded?.patch).toMatchObject({ recipient_count: 2, provider_message_id: 'email_1' });
  });

  it('retries a provider outage later', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ name: 'internal_server_error' }), { status: 503 }));
    expect(await processStatementEmails({ now: () => NOW })).toMatchObject({ retrying: 1 });
  });

  it('gives up when the business has nobody to email', async () => {
    const resolve = db.resolve;
    db.resolve = (call) =>
      call.table === 'business_accounts' ? { data: { contact_email: '' }, error: null } : call.table === 'business_account_members' ? { data: [], error: null } : resolve(call);
    expect(await processStatementEmails({ now: () => NOW })).toMatchObject({ failed: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('claims nothing without an email provider', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(await processStatementEmails({ now: () => NOW })).toEqual({ processed: 0, accepted: 0, retrying: 0, failed: 0 });
    expect(db.calls).toEqual([]);
  });
});
