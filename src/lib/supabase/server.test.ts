import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { createServerClient, createBearerClient, cookies } = vi.hoisted(() => ({
  createServerClient: vi.fn(() => ({ kind: 'cookie' })),
  createBearerClient: vi.fn(() => ({ kind: 'bearer' })),
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

vi.mock('@supabase/ssr', () => ({ createServerClient }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createBearerClient }));
vi.mock('next/headers', () => ({ cookies }));

import { createClient } from '@/lib/supabase/server';
import { runWithMobileAccessToken } from '@/lib/supabase/mobile-auth-context';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createClient', () => {
  it('uses the cookie session for website requests (unchanged behaviour)', async () => {
    expect(await createClient()).toEqual({ kind: 'cookie' });
    expect(cookies).toHaveBeenCalledOnce();
    expect(createBearerClient).not.toHaveBeenCalled();
  });

  it("acts as the bearer token's user inside a mobile request, ignoring cookies", async () => {
    const client = await runWithMobileAccessToken('the-token', () => createClient());
    expect(client).toEqual({ kind: 'bearer' });
    expect(cookies).not.toHaveBeenCalled();
    const options = (createBearerClient.mock.calls[0] as unknown[])[2] as {
      global: { headers: Record<string, string> };
      auth: { persistSession: boolean; autoRefreshToken: boolean };
    };
    expect(options.global.headers.Authorization).toBe('Bearer the-token');
    expect(options.auth).toMatchObject({ persistSession: false, autoRefreshToken: false });
  });
});
