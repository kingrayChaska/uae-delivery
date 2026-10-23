import { beforeEach, describe, expect, it, vi } from 'vitest';

import { guestInvoice } from '@/lib/invoices/fixtures.test-helpers';

import type { Invoice, InvoicePayment } from '@/lib/invoices/types';

// The invoice PDF download. Access is RLS's decision (getInvoiceByNumber
// reads with the caller's session, migration 0031): what it doesn't return
// is a 404, exactly like an invoice that doesn't exist. Nothing is issued
// here, so downloading again can't bill twice.

const NUMBER = 'INV-2026-000042';

const profile = vi.hoisted(() => ({ current: null as null | { role: string; active: boolean } }));
const visible = vi.hoisted(() => ({ current: null as Invoice | null }));
const payment = vi.hoisted(() => ({ current: null as InvoicePayment | null }));
const reads = vi.hoisted(() => [] as string[]);
const issue = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/i18n/request', () => ({ getRequestLocale: async () => 'en' }));
vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: async () => profile.current }));
vi.mock('@/services/invoices/get-invoice', () => ({
  getInvoiceByNumber: async (number: string) => {
    reads.push(number);
    return visible.current;
  },
  getInvoicePayment: async () => payment.current,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: issue }) }));

const { GET } = await import('@/app/api/invoices/[number]/pdf/route');

const request = (number: string) => GET(new Request(`http://x/api/invoices/${number}/pdf`) as never, { params: Promise.resolve({ number }) });

beforeEach(() => {
  profile.current = { role: 'operator', active: true };
  visible.current = guestInvoice();
  payment.current = { state: 'unpaid', amountDue: 25, currency: 'AED', checkedAt: '2026-10-22T10:00:00Z' };
  reads.length = 0;
  issue.mockReset();
});

describe('GET /api/invoices/[number]/pdf', () => {
  it.each(['operator', 'manager', 'customer'])('downloads an invoice a %s may see — a guest booking’s included', async (role) => {
    profile.current = { role, active: true };
    const response = await request(NUMBER);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${NUMBER}.pdf"`);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(Buffer.from(await response.arrayBuffer()).toString('latin1').startsWith('%PDF-')).toBe(true);
  });

  it('downloads repeatedly without issuing or writing anything', async () => {
    await request(NUMBER);
    await request(NUMBER);
    expect(reads).toEqual([NUMBER, NUMBER]);
    expect(issue).not.toHaveBeenCalled();
  });

  it('still downloads when the payment status can’t be read', async () => {
    payment.current = null;
    expect((await request(NUMBER)).status).toBe(200);
  });

  it('404s when RLS doesn’t return the invoice', async () => {
    visible.current = null;
    expect((await request(NUMBER)).status).toBe(404);
  });

  it.each([
    ['signed out', null],
    ['inactive', { role: 'operator', active: false }],
    ['a driver', { role: 'driver', active: true }],
  ])('404s for %s without reading anything', async (_, who) => {
    profile.current = who;
    expect((await request(NUMBER)).status).toBe(404);
    expect(reads).toEqual([]);
  });

  it.each(['INV-1', '../../etc/passwd', 'INV-2026-00004x'])('404s for a malformed number (%s) without reading', async (number) => {
    expect((await request(number)).status).toBe(404);
    expect(reads).toEqual([]);
  });
});
