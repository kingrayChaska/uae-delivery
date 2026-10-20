import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getMobileAccessToken, runWithMobileAccessToken } from '@/lib/supabase/mobile-auth-context';

describe('mobile access token scope', () => {
  it('is empty outside a mobile request — every website request', () => {
    expect(getMobileAccessToken()).toBeUndefined();
  });

  it('is visible to everything awaited inside the scope, and gone after', async () => {
    const seen = await runWithMobileAccessToken('token-a', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getMobileAccessToken();
    });
    expect(seen).toBe('token-a');
    expect(getMobileAccessToken()).toBeUndefined();
  });

  it('never leaks between concurrent requests', async () => {
    const run = (token: string, delay: number) =>
      runWithMobileAccessToken(token, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return getMobileAccessToken();
      });
    const results = await Promise.all([run('first', 20), run('second', 1), run('third', 10)]);
    expect(results).toEqual(['first', 'second', 'third']);
  });
});
