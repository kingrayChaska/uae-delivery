import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codStatement } from '@/lib/finance/fixtures.test-helpers';

import type { Statement } from '@/lib/finance/statements';

// The statement PDF download. Access is RLS's decision (getStatement reads
// with the caller's session, migration 0044): what RLS doesn't return is a
// 404, exactly like a statement that doesn't exist.

const STATEMENT = '11111111-1111-4111-8111-111111111111';

const profile = vi.hoisted(() => ({ current: null as null | { role: string; active: boolean } }));
const visible = vi.hoisted(() => ({ current: null as Statement | null }));
const reads = vi.hoisted(() => [] as string[]);
const locale = vi.hoisted(() => ({ current: 'en' as 'en' | 'ar' }));

vi.mock('server-only', () => ({}));
vi.mock('@/i18n/request', () => ({ getRequestLocale: async () => locale.current }));
vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: async () => profile.current }));
vi.mock('@/services/finance/statements', () => ({
  getStatement: async (id: string) => {
    reads.push(id);
    return visible.current;
  },
}));

const { GET } = await import('@/app/api/statements/[id]/pdf/route');

const request = (id: string) => GET(new Request(`http://x/api/statements/${id}/pdf`) as never, { params: Promise.resolve({ id }) });

beforeEach(() => {
  profile.current = { role: 'customer', active: true };
  visible.current = codStatement();
  reads.length = 0;
  locale.current = 'en';
});

describe('GET /api/statements/[id]/pdf', () => {
  it('returns the PDF of a statement the caller may see', async () => {
    const response = await request(STATEMENT);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="STM-2026-000001-Bravo-Goods.pdf"');
    const bytes = Buffer.from(await response.arrayBuffer()).toString('latin1');
    expect(bytes.startsWith('%PDF-')).toBe(true);
  });

  it('is drawn in the reader’s language', async () => {
    locale.current = 'ar';
    const response = await request(STATEMENT);
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer()).toString('latin1');
    expect(bytes).toContain('/Lang (ar)');
  });

  it('404s when RLS doesn’t return the statement (another merchant’s, or a draft)', async () => {
    visible.current = null;
    expect((await request(STATEMENT)).status).toBe(404);
  });

  it.each([
    ['signed out', null],
    ['inactive', { role: 'customer', active: false }],
    ['a driver', { role: 'driver', active: true }],
    ['an operator', { role: 'operator', active: true }],
  ])('404s for %s without reading anything', async (_, who) => {
    profile.current = who;
    expect((await request(STATEMENT)).status).toBe(404);
    expect(reads).toEqual([]);
  });

  it('404s for a malformed id without reading anything', async () => {
    expect((await request('..%2F..%2Fetc')).status).toBe(404);
    expect(reads).toEqual([]);
  });
});
