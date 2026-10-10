import { beforeEach, describe, expect, it, vi } from 'vitest';

// The cron sweep: only the worker secret gets in, and nothing in the
// request (query, body, headers) can choose what is sent or to whom.

const SECRET = 'test-worker-secret-0123456789abcdef';
const process_ = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/services/notifications/operator-booking-emails', () => ({ processOperatorBookingEmails: process_ }));

const { GET } = await import('@/app/api/internal/operator-emails/route');

const request = (url: string, authorization?: string) =>
  ({ headers: new Headers(authorization ? { authorization } : {}), url, nextUrl: new URL(url) }) as never;

beforeEach(() => {
  process_.mockReset();
  process_.mockResolvedValue({ processed: 0, accepted: 0, retrying: 0, failed: 0 });
  vi.stubEnv('BULK_WORKER_SECRET', SECRET);
});

describe('GET /api/internal/operator-emails', () => {
  it('is a 404 without the worker secret', async () => {
    expect((await GET(request('https://app.test/api/internal/operator-emails'))).status).toBe(404);
    expect((await GET(request('https://app.test/api/internal/operator-emails', 'Bearer wrong-secret-0123456789abcd'))).status).toBe(404);
    expect(process_).not.toHaveBeenCalled();
  });

  it('runs the sweep with the secret, ignoring anything in the request', async () => {
    const response = await GET(request(`https://app.test/api/internal/operator-emails?to=attacker@evil.example&id=x`, `Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(process_).toHaveBeenCalledWith({ limit: 50 });
  });
});
