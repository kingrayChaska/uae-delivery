import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// A minimal stand-in for the service-role client: records every update and
// answers the claim with whatever the test queued.
const db = vi.hoisted(() => ({
  claimed: [] as unknown[],
  claimError: null as null | { code: string },
  shipments: [] as { id: string; tracking_number: string }[],
  updates: [] as { table: string; values: Record<string, unknown>; filters: [string, string, unknown][] }[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: db.claimed, error: db.claimError }),
    from: (table: string) => {
      const filters: [string, string, unknown][] = [];
      let values: Record<string, unknown> | null = null;
      const chain = {
        update: (v: Record<string, unknown>) => ((values = v), chain),
        select: () => chain,
        eq: (c: string, v: unknown) => (filters.push(['eq', c, v]), chain),
        lt: (c: string, v: unknown) => (filters.push(['lt', c, v]), chain),
        gte: (c: string, v: unknown) => (filters.push(['gte', c, v]), chain),
        in: (c: string, v: unknown) => (filters.push(['in', c, v]), chain),
        then: (resolve: (value: unknown) => void) => {
          if (values) db.updates.push({ table, values, filters });
          resolve({ data: table === 'shipments' ? db.shipments : [], error: null });
        },
      };
      return chain;
    },
  }),
}));

import { EXPO_PUSH_URL, buildMessages, interpretTickets, processPushNotifications, trackingCodeOf } from '@/services/notifications/push-delivery';

import type { ClaimedNotification } from '@/services/notifications/push-delivery';

const notification = (overrides: Partial<ClaimedNotification> = {}): ClaimedNotification => ({
  notification_id: 'n1',
  profile_id: 'p1',
  type: 'shipment.ready_for_dispatch',
  title: 'New shipment ready for dispatch',
  body: 'PL-ABC123 is confirmed and awaiting a driver.',
  attempts: 1,
  tokens: ['ExponentPushToken[aaaaaaaaaa]'],
  ...overrides,
});

const expo = (respond: (messages: { to: string }[]) => Response | Promise<Response>) =>
  vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe(EXPO_PUSH_URL);
    return respond(JSON.parse(String(init?.body)));
  });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  db.claimed = [];
  db.claimError = null;
  db.shipments = [];
  db.updates = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('message building', () => {
  it('finds the tracking code with the same rules the app translates with', () => {
    expect(trackingCodeOf(notification())).toBe('PL-ABC123');
    expect(trackingCodeOf(notification({ type: 'something.else', body: 'Free text' }))).toBeNull();
  });

  it('sends one message per device, with the shipment to open when there is one', () => {
    const messages = buildMessages(notification({ tokens: ['ExponentPushToken[a1a1a1a1a1]', 'ExponentPushToken[b2b2b2b2b2]'] }), 'ship-1');
    expect(messages.map((m) => m.to)).toEqual(['ExponentPushToken[a1a1a1a1a1]', 'ExponentPushToken[b2b2b2b2b2]']);
    expect(messages[0].data).toEqual({ notificationId: 'n1', type: 'shipment.ready_for_dispatch', shipmentId: 'ship-1' });
    expect(buildMessages(notification(), null)[0].data).not.toHaveProperty('shipmentId');
  });
});

describe('interpretTickets', () => {
  const tokens = ['t1', 't2'];
  const gone = { status: 'error', details: { error: 'DeviceNotRegistered' } } as const;

  it('is sent when any device accepted it, and disables the gone ones', () => {
    expect(interpretTickets(tokens, [{ status: 'ok', id: 'x' }, gone], 1)).toEqual({ outcome: 'sent', deadTokens: ['t2'], error: null });
  });

  it('fails at once when every device is gone', () => {
    expect(interpretTickets(tokens, [gone, gone], 1)).toMatchObject({ outcome: 'failed', deadTokens: ['t1', 't2'] });
  });

  it('retries other errors until the last attempt', () => {
    const rateLimited = { status: 'error', details: { error: 'MessageRateExceeded' } } as const;
    expect(interpretTickets(tokens, [rateLimited, rateLimited], 1).outcome).toBe('retrying');
    expect(interpretTickets(tokens, [rateLimited, rateLimited], 3).outcome).toBe('failed');
  });
});

describe('processPushNotifications', () => {
  it('sends claimed notifications and records them sent', async () => {
    db.claimed = [notification()];
    db.shipments = [{ id: 'ship-1', tracking_number: 'PL-ABC123' }];
    const fetchImpl = expo((messages) => {
      expect(messages).toHaveLength(1);
      return json({ data: [{ status: 'ok', id: 'ticket' }] });
    });

    const summary = await processPushNotifications({ fetchImpl });

    expect(summary).toMatchObject({ processed: 1, sent: 1, failed: 0 });
    const sent = db.updates.find((u) => u.table === 'notification_push_deliveries' && u.values.status === 'sent');
    expect(sent?.filters).toEqual([['eq', 'notification_id', 'n1']]);
  });

  it('leaves a notification for retry when Expo is down', async () => {
    db.claimed = [notification()];
    const summary = await processPushNotifications({ fetchImpl: expo(() => json({}, 503)) });
    expect(summary).toMatchObject({ processed: 1, retrying: 1, sent: 0 });
    const retry = db.updates.find((u) => u.table === 'notification_push_deliveries' && u.values.last_error === 'http_503');
    expect(retry?.values).not.toHaveProperty('status');
  });

  it('disables tokens Expo no longer recognises', async () => {
    db.claimed = [notification({ tokens: ['ExponentPushToken[deaddeaddd]'] })];
    const summary = await processPushNotifications({
      fetchImpl: expo(() => json({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] })),
    });
    expect(summary).toMatchObject({ failed: 1, disabledTokens: 1 });
    const disabled = db.updates.find((u) => u.table === 'mobile_push_devices');
    expect(disabled?.values).toEqual({ enabled: false, disabled_reason: 'DeviceNotRegistered' });
    expect(disabled?.filters).toEqual([['in', 'expo_push_token', ['ExponentPushToken[deaddeaddd]']]]);
  });

  it('does nothing (and calls nobody) when nothing is due', async () => {
    const fetchImpl = vi.fn();
    expect(await processPushNotifications({ fetchImpl })).toMatchObject({ processed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('stops quietly when the claim fails', async () => {
    db.claimError = { code: '42883' };
    const fetchImpl = vi.fn();
    expect(await processPushNotifications({ fetchImpl })).toMatchObject({ processed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
