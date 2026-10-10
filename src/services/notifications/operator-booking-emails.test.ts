import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// processOperatorBookingEmails: sending what migration 0043 queued. The
// service-role client is faked (claims, lookups and outcome writes are
// recorded); the real sendEmail runs against a stubbed fetch, so what is
// checked is the request Resend would actually get.

const OUTBOX_ID = '4e5f6a7b-8c9d-4e0f-8a1b-2c3d4e5f6a7b';
const SHIPMENT_ID = '0b9f1d2e-3c4a-4b5c-8d6e-7f8091a2b3c4';
const BATCH_ID = '1c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';
const NOW = new Date('2026-10-10T09:00:00Z');

type Filter = [op: string, column: string, value: unknown];
type Call = { table: string; op: 'select' | 'update'; patch?: Record<string, unknown>; filters: Filter[] };
type Result = { data: unknown; error: { code: string } | null; count?: number | null };

const db = vi.hoisted(() => ({
  calls: [] as Call[],
  claimed: [] as Record<string, unknown>[],
  claimArgs: [] as unknown[],
  claimError: null as { code: string } | null,
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
        update: (patch: Record<string, unknown>) => {
          call.op = 'update';
          call.patch = patch;
          return builder;
        },
        eq: (column: string, value: unknown) => (call.filters.push(['eq', column, value]), builder),
        lt: (column: string, value: unknown) => (call.filters.push(['lt', column, value]), builder),
        gte: (column: string, value: unknown) => (call.filters.push(['gte', column, value]), builder),
        order: () => builder,
        limit: () => builder,
        maybeSingle: run,
        then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => run().then(resolve, reject),
      };
      return builder;
    },
    rpc: (name: string, args: unknown) => {
      db.claimArgs.push({ name, args });
      return Promise.resolve(db.claimError ? { data: null, error: db.claimError } : { data: db.claimed, error: null });
    },
  }),
}));

const { MAX_ATTEMPTS, processOperatorBookingEmails, retryDelayMs } = await import('@/services/notifications/operator-booking-emails');

const shipmentRow = {
  id: SHIPMENT_ID,
  tracking_number: 'PL7KX9QM',
  status: 'confirmed',
  payment_method: 'cod',
  payment_status: 'pending',
  delivery_type: 'same_day',
  delivery_date: null,
  pickup_address: 'Al Barsha 1, Dubai',
  pickup_contact_name: 'Aisha Rahman',
  pickup_contact_phone: '+971 50 123 4567',
  dropoff_address: 'Business Bay, Dubai',
  package_type: 'parcel',
  package_description: 'Shoes',
  package_quantity: 1,
  is_fragile: false,
  created_at: '2026-10-10T08:59:00Z',
  // A customer's own email in the data must never become a recipient.
  customer: { full_name: 'Aisha Rahman', phone: '+971 50 123 4567', account_type: 'individual', email: 'aisha@example.com' },
  business: null,
};

const outbox = (overrides: Record<string, unknown> = {}) => ({
  id: OUTBOX_ID,
  shipment_id: SHIPMENT_ID,
  batch_id: null,
  attempts: 1,
  created_at: '2026-10-10T08:59:00Z',
  ...overrides,
});

// Outcome writes succeed (one row) unless a test says otherwise.
const defaultResolve = (call: Call): Result => {
  if (call.table === 'operator_booking_emails') return { data: call.filters.some(([op]) => op === 'lt') ? [] : [{ id: OUTBOX_ID }], error: null };
  if (call.table === 'shipments') return { data: shipmentRow, error: null };
  return { data: null, error: null };
};

const fetchMock = vi.fn();
const respond = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

const outcomeWrites = () => db.calls.filter((c) => c.table === 'operator_booking_emails' && c.op === 'update' && !c.filters.some(([op]) => op === 'lt'));
// The structured events (sendEmail's own plain-text lines are skipped).
const logged = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls
    .map((args: unknown[]) => String(args[0]))
    .filter((line: string) => line.startsWith('{'))
    .map((line: string) => JSON.parse(line).event);

let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db.calls = [];
  db.claimed = [outbox()];
  db.claimArgs = [];
  db.claimError = null;
  db.resolve = defaultResolve;
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => respond(200, { id: 'resend-msg-123' }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  vi.stubEnv('EMAIL_FROM', 'ParcelLink <notifications@parcellinkuae.com>');
  vi.stubEnv('OPERATOR_NOTIFICATION_EMAIL', 'ops@parcellinkuae.com');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.parcellinkuae.com');
  info = vi.spyOn(console, 'info').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const run = () => processOperatorBookingEmails({ now: () => NOW });

describe('sending a queued shipment email', () => {
  it('sends to the configured inbox and records the provider acceptance', async () => {
    const summary = await run();
    expect(summary).toEqual({ processed: 1, accepted: 1, retrying: 0, failed: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe(`operator-booking-email/${OUTBOX_ID}`);
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(['ops@parcellinkuae.com']);
    expect(body.subject).toBe('New Individual Shipment — PL7KX9QM');
    expect(body.html).toContain(`https://app.parcellinkuae.com/dashboard/operator/shipments/${SHIPMENT_ID}`);

    const [write] = outcomeWrites();
    expect(write.patch).toMatchObject({ status: 'accepted', provider_message_id: 'resend-msg-123', last_error: null, locked_until: null });
    // Only while this worker still holds the claim.
    expect(write.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'id', OUTBOX_ID],
        ['eq', 'status', 'sending'],
        ['eq', 'attempts', 1],
      ]),
    );
    expect(logged(info)).toEqual(['notification_requested', 'provider_accepted']);
  });

  it('claims with the attempt cap and a lease', async () => {
    await run();
    expect(db.claimArgs).toEqual([
      { name: 'claim_operator_booking_emails', args: { p_limit: 10, p_lease_seconds: 120, p_max_attempts: MAX_ATTEMPTS } },
    ]);
  });

  it('accepts several comma-separated inboxes and drops malformed ones', async () => {
    vi.stubEnv('OPERATOR_NOTIFICATION_EMAIL', 'ops@parcellinkuae.com, Dispatch@ParcelLinkUAE.com ,not-an-email');
    await run();
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.to).toEqual(['ops@parcellinkuae.com', 'dispatch@parcellinkuae.com']);
    expect(logged(warn)).toContain('recipient_invalid');
  });

  it('never sends to an address taken from the booking data', async () => {
    await run();
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.to).not.toContain('aisha@example.com');
    expect(JSON.stringify(body)).not.toContain('aisha@example.com');
  });

  it('logs no customer names, phones or addresses', async () => {
    await run();
    const lines = [...info.mock.calls, ...warn.mock.calls, ...error.mock.calls].map((args) => String(args[0])).join('\n');
    expect(lines).not.toMatch(/Aisha|971|Barsha|Business Bay|ops@|re_test_key/);
  });
});

describe('a merchant shipment', () => {
  it('is labelled as a merchant shipment with the company name', async () => {
    db.resolve = (call) =>
      call.table === 'shipments'
        ? { data: { ...shipmentRow, customer: { ...shipmentRow.customer, account_type: 'merchant' }, business: { company_name: 'Desert Goods LLC' } }, error: null }
        : defaultResolve(call);
    await run();
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.subject).toBe('New Merchant Shipment — PL7KX9QM');
    expect(body.html).toContain('Desert Goods LLC');
  });
});

describe('a bulk booking', () => {
  it('sends one summary email for the whole batch', async () => {
    db.claimed = [outbox({ shipment_id: null, batch_id: BATCH_ID })];
    const shipments = Array.from({ length: 3 }, (_, i) => ({
      id: `2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6${i}`,
      tracking_number: `TRK0000${i}`,
      dropoff_address: `Dropoff ${i}`,
      delivery_type: 'next_day',
      status: 'confirmed',
      payment_method: 'cod',
    }));
    db.resolve = (call) => {
      if (call.table === 'shipment_batches') {
        return {
          data: {
            id: BATCH_ID,
            reference: 'BLK-20261010-A1B2C3D4',
            pickup_address: 'Warehouse 7, Al Quoz',
            pickup_date: '2026-10-11',
            created_at: '2026-10-10T08:50:00Z',
            booked_at: '2026-10-10T08:58:00Z',
            rows_failed: 0,
            customer: { full_name: 'Omar Haddad', phone: '+971 4 555 0101', account_type: 'merchant' },
            business: { company_name: 'Desert Goods LLC' },
          },
          error: null,
        };
      }
      if (call.table === 'shipments') {
        expect(call.filters).toContainEqual(['eq', 'batch_id', BATCH_ID]);
        return { data: shipments, error: null, count: 3 };
      }
      return defaultResolve(call);
    };

    const summary = await run();
    expect(summary.accepted).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.subject).toBe('New Merchant Bulk Booking — BLK-20261010-A1B2C3D4 (3 shipments)');
    for (const s of shipments) expect(body.html).toContain(s.tracking_number);
    expect(body.html).toContain(`/dashboard/operator/bulk/${BATCH_ID}`);
  });
});

describe('configuration problems', () => {
  it('claims nothing without a recipient, so no attempt is used up', async () => {
    vi.stubEnv('OPERATOR_NOTIFICATION_EMAIL', '');
    const summary = await run();
    expect(summary.processed).toBe(0);
    expect(db.claimArgs).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged(error)).toContain('recipient_missing');
  });

  it('claims nothing when the recipient setting holds no valid address', async () => {
    vi.stubEnv('OPERATOR_NOTIFICATION_EMAIL', 'ops at parcellink');
    await run();
    expect(db.claimArgs).toHaveLength(0);
    expect(logged(error)).toContain('recipient_missing');
  });

  it('claims nothing without the email provider', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    await run();
    expect(db.claimArgs).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged(error)).toContain('provider_not_configured');
  });
});

describe('provider failures and retries', () => {
  it('schedules a retry with backoff on a transient error', async () => {
    fetchMock.mockImplementation(() => respond(503, { name: 'internal_server_error' }));
    const summary = await run();
    expect(summary).toEqual({ processed: 1, accepted: 0, retrying: 1, failed: 0 });
    const [write] = outcomeWrites();
    expect(write.patch).toMatchObject({
      status: 'pending',
      last_error: 'http_503',
      next_attempt_at: new Date(NOW.getTime() + retryDelayMs(1)).toISOString(),
    });
    expect(logged(warn)).toContain('retry_scheduled');
  });

  it('retries a network failure and a rate limit', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('fetch failed')));
    await run();
    expect(outcomeWrites()[0].patch).toMatchObject({ status: 'pending', last_error: 'network' });

    db.calls = [];
    fetchMock.mockImplementationOnce(() => respond(429, { name: 'rate_limit_exceeded' }));
    await run();
    expect(outcomeWrites()[0].patch).toMatchObject({ status: 'pending', last_error: 'http_429' });
  });

  it('backs off further on each attempt', () => {
    const delays = [1, 2, 3, 4, 5].map(retryDelayMs);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(5);
  });

  it('gives up after the last attempt', async () => {
    db.claimed = [outbox({ attempts: MAX_ATTEMPTS })];
    fetchMock.mockImplementation(() => respond(503, {}));
    const summary = await run();
    expect(summary.failed).toBe(1);
    expect(outcomeWrites()[0].patch).toMatchObject({ status: 'failed', last_error: 'http_503' });
    expect(logged(error)).toContain('notification_failed');
  });

  it('does not retry a permanent rejection', async () => {
    fetchMock.mockImplementation(() => respond(422, { name: 'validation_error', message: 'Invalid `to` field: ops@parcellinkuae.com' }));
    const summary = await run();
    expect(summary.failed).toBe(1);
    expect(outcomeWrites()[0].patch).toMatchObject({ status: 'failed', last_error: 'http_422' });
    // The provider's message (which quotes the address) isn't logged.
    const lines = error.mock.calls.map((args: unknown[]) => args.join(' ')).join('\n');
    expect(lines).not.toContain('ops@parcellinkuae.com');
  });

  it('retries when the booking could not be loaded', async () => {
    db.resolve = (call) => (call.table === 'shipments' ? { data: null, error: { code: '57014' } } : defaultResolve(call));
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcomeWrites()[0].patch).toMatchObject({ status: 'pending', last_error: 'load_failed:57014' });
  });

  it('fails a row whose booking no longer exists', async () => {
    db.resolve = (call) => (call.table === 'shipments' ? { data: null, error: null } : defaultResolve(call));
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcomeWrites()[0].patch).toMatchObject({ status: 'failed', last_error: 'booking_not_found' });
  });

  it('does not send a booking that is days old', async () => {
    db.claimed = [outbox({ created_at: '2026-10-07T09:00:00Z' })];
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcomeWrites()[0].patch).toMatchObject({ status: 'failed', last_error: 'expired' });
  });

  it('marks rows abandoned mid-send on their last attempt as failed', async () => {
    db.claimed = [];
    db.resolve = (call) =>
      call.table === 'operator_booking_emails' && call.filters.some(([op]) => op === 'lt') ? { data: [{ id: OUTBOX_ID }], error: null } : defaultResolve(call);
    await run();
    const sweep = db.calls.find((c) => c.filters.some(([op]) => op === 'lt'))!;
    expect(sweep.patch).toMatchObject({ status: 'failed', last_error: 'abandoned' });
    expect(sweep.filters).toEqual(expect.arrayContaining([['eq', 'status', 'sending'], ['gte', 'attempts', MAX_ATTEMPTS]]));
  });

  it('a claim failure sends nothing', async () => {
    db.claimError = { code: '42501' };
    const summary = await run();
    expect(summary.processed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged(error)).toContain('claim_failed');
  });
});

describe('duplicates', () => {
  it('treats a reused idempotency key with a changed body as already sent', async () => {
    fetchMock.mockImplementation(() => respond(409, { name: 'invalid_idempotent_request' }));
    const summary = await run();
    expect(summary.accepted).toBe(1);
    expect(outcomeWrites()[0].patch).toMatchObject({ status: 'accepted', last_error: 'idempotent_replay' });
    expect(logged(warn)).toContain('duplicate_ignored');
  });

  it('retries while the same key is still in flight at the provider', async () => {
    fetchMock.mockImplementation(() => respond(409, { name: 'concurrent_idempotent_requests' }));
    const summary = await run();
    expect(summary.retrying).toBe(1);
  });

  it("ignores its own outcome when another worker took the row over", async () => {
    db.resolve = (call) => (call.table === 'operator_booking_emails' ? { data: [], error: null } : defaultResolve(call));
    const summary = await run();
    expect(summary).toEqual({ processed: 1, accepted: 0, retrying: 0, failed: 0 });
    expect(logged(warn)).toContain('duplicate_ignored');
  });

  it('sends nothing when there is nothing due', async () => {
    db.claimed = [];
    const summary = await run();
    expect(summary.processed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
