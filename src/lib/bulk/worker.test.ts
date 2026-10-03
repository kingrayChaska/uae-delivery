import { afterEach, describe, expect, it, vi } from 'vitest';

import { isWorkerRequest, workerEnabled } from '@/lib/bulk/worker';

vi.mock('server-only', () => ({}));

const SECRET = 'a-long-enough-worker-secret';

describe('bulk worker authorization', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is off without a secret, and rejects every request', () => {
    vi.stubEnv('BULK_WORKER_SECRET', '');
    vi.stubEnv('CRON_SECRET', '');
    expect(workerEnabled()).toBe(false);
    expect(isWorkerRequest('Bearer ')).toBe(false);
    expect(isWorkerRequest(null)).toBe(false);
  });

  it('refuses a secret too short to be safe', () => {
    vi.stubEnv('BULK_WORKER_SECRET', 'short');
    expect(workerEnabled()).toBe(false);
    expect(isWorkerRequest('Bearer short')).toBe(false);
  });

  it('accepts only the exact bearer secret', () => {
    vi.stubEnv('BULK_WORKER_SECRET', SECRET);
    expect(isWorkerRequest(`Bearer ${SECRET}`)).toBe(true);
    expect(isWorkerRequest(SECRET)).toBe(false);
    expect(isWorkerRequest(`Bearer ${SECRET}x`)).toBe(false);
    expect(isWorkerRequest('Bearer wrong-secret-of-same-len')).toBe(false);
  });

  it("falls back to Vercel's CRON_SECRET", () => {
    vi.stubEnv('BULK_WORKER_SECRET', '');
    vi.stubEnv('CRON_SECRET', SECRET);
    expect(isWorkerRequest(`Bearer ${SECRET}`)).toBe(true);
  });
});
