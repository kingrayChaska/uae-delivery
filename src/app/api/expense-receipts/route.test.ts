import { beforeEach, describe, expect, it, vi } from 'vitest';

// Receipt uploads (migration 0053): the only way a file gets into the
// private expense-receipts bucket. The session, the size and the file's real
// type are checked here; attaching it to an expense is the database's check
// (database/test/expense-receipts.sql).

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOMEONE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const profile = vi.hoisted(() => ({ current: null as null | { id: string; role: string; active: boolean } }));
const allowed = vi.hoisted(() => ({ current: true }));
const attached = vi.hoisted(() => ({ current: [] as string[] }));
const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
}));
const afterTasks = vi.hoisted(() => [] as (() => unknown)[]);

vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => afterTasks.push(task),
}));
vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: async () => profile.current }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: async () => allowed.current }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: { from: () => storage },
    from: () => ({
      select: () => ({
        in: async (_: string, paths: string[]) => ({ data: paths.filter((p) => attached.current.includes(p)).map((p) => ({ storage_path: p })), error: null }),
      }),
    }),
  }),
}));

const { POST, DELETE } = await import('@/app/api/expense-receipts/route');

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF = new TextEncoder().encode('%PDF-1.4\n%');

const upload = (body: BodyInit) => POST(new Request('http://x/api/expense-receipts', { method: 'POST', body }) as never);
const formWith = (content: BlobPart, name: string, type: string) => {
  const form = new FormData();
  form.append('file', new File([content], name, { type }));
  return form;
};
const remove = (path: string) => {
  const url = new URL(`http://x/api/expense-receipts?path=${encodeURIComponent(path)}`);
  return DELETE(Object.assign(new Request(url, { method: 'DELETE' }), { nextUrl: url }) as never);
};

beforeEach(() => {
  profile.current = { id: ME, role: 'operator', active: true };
  allowed.current = true;
  attached.current = [];
  afterTasks.length = 0;
  storage.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  storage.remove.mockReset().mockResolvedValue({ data: [], error: null });
  storage.list.mockReset().mockResolvedValue({ data: [], error: null });
});

describe('POST /api/expense-receipts', () => {
  it.each(['operator', 'manager'])('stores a %s’s JPEG in their own folder, typed by its bytes', async (role) => {
    profile.current = { id: ME, role, active: true };
    const response = await upload(formWith(JPEG, 'IMG_0012.HEIC', 'application/octet-stream'));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ contentType: 'image/jpeg', size: JPEG.length });
    expect(body.path).toMatch(new RegExp(`^${ME}/receipt-[0-9a-f-]{36}\\.jpg$`));
    expect(storage.upload).toHaveBeenCalledWith(body.path, expect.any(Uint8Array), { contentType: 'image/jpeg', upsert: false });
  });

  it('keeps accepting PDF receipts', async () => {
    const response = await upload(formWith(PDF, 'invoice.pdf', 'application/pdf'));
    expect(response.status).toBe(201);
    expect((await response.json()).path).toMatch(/\.pdf$/);
  });

  it('refuses a file that only claims to be a picture', async () => {
    const response = await upload(formWith('<html><script>alert(1)</script>', 'receipt.jpg', 'image/jpeg'));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: 'finance.expenses.form.receiptType' });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('refuses a file over 4 MB before reading it', async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(JPEG);
    const response = await upload(formWith(big, 'big.jpg', 'image/jpeg'));
    expect(response.status).toBe(413);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('refuses a request without a file, or an empty one', async () => {
    expect((await upload(new FormData())).status).toBe(400);
    expect((await upload(formWith('', 'empty.jpg', 'image/jpeg'))).status).toBe(400);
  });

  it.each([
    ['signed out', null],
    ['a driver', { id: ME, role: 'driver', active: true }],
    ['a customer', { id: ME, role: 'customer', active: true }],
  ])('refuses %s', async (_, who) => {
    profile.current = who;
    expect((await upload(formWith(JPEG, 'r.jpg', 'image/jpeg'))).status).toBe(403);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('is rate limited', async () => {
    allowed.current = false;
    expect((await upload(formWith(JPEG, 'r.jpg', 'image/jpeg'))).status).toBe(429);
  });

  it('reports a storage failure as a retryable error', async () => {
    storage.upload.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const response = await upload(formWith(JPEG, 'r.jpg', 'image/jpeg'));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'finance.expenses.form.receiptFailed' });
  });

  it('afterwards removes the caller’s own unattached uploads older than a day', async () => {
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const fresh = new Date().toISOString();
    storage.list.mockResolvedValue({
      data: [
        { id: '1', name: 'receipt-old.jpg', created_at: old },
        { id: '2', name: 'receipt-kept.jpg', created_at: old },
        { id: '3', name: 'receipt-new.jpg', created_at: fresh },
      ],
      error: null,
    });
    attached.current = [`${ME}/receipt-kept.jpg`];
    await upload(formWith(JPEG, 'r.jpg', 'image/jpeg'));
    await Promise.all(afterTasks.map((task) => task()));
    expect(storage.list).toHaveBeenCalledWith(ME, expect.anything());
    expect(storage.remove).toHaveBeenCalledWith([`${ME}/receipt-old.jpg`]);
  });
});

describe('DELETE /api/expense-receipts', () => {
  it('removes the caller’s own upload that isn’t attached', async () => {
    expect((await remove(`${ME}/receipt-1.jpg`)).status).toBe(204);
    expect(storage.remove).toHaveBeenCalledWith([`${ME}/receipt-1.jpg`]);
  });

  it('never removes an attached receipt', async () => {
    attached.current = [`${ME}/receipt-1.jpg`];
    expect((await remove(`${ME}/receipt-1.jpg`)).status).toBe(409);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([`${SOMEONE}/receipt-1.jpg`, `${ME}/../${SOMEONE}/receipt-1.jpg`, 'receipt-1.jpg'])('never touches another folder (%s)', async (path) => {
    expect((await remove(path)).status).toBe(404);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('refuses a driver', async () => {
    profile.current = { id: ME, role: 'driver', active: true };
    expect((await remove(`${ME}/receipt-1.jpg`)).status).toBe(403);
  });
});
