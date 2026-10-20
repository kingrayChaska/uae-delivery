import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const m = vi.hoisted(() => ({
  setStaffActiveAction: vi.fn(),
  listMerchantApplications: vi.fn(),
  countMerchantApplicationsByStatus: vi.fn(),
  getReportData: vi.fn(),
}));

vi.mock('@/lib/staff/actions', () => ({ setStaffActiveAction: m.setStaffActiveAction }));
vi.mock('@/services/audit/list-audit-logs', () => ({ listAuditLogs: vi.fn() }));
vi.mock('@/services/finance/performance', () => ({ getPerformanceSummary: vi.fn() }));
vi.mock('@/services/finance/statements', () => ({ listStatements: vi.fn() }));
vi.mock('@/services/merchant/applications', () => ({
  listMerchantApplications: m.listMerchantApplications,
  countMerchantApplicationsByStatus: m.countMerchantApplicationsByStatus,
}));
vi.mock('@/services/reports/get-report-data', () => ({ getReportData: m.getReportData }));
vi.mock('@/services/shipments/get-manager-summary', () => ({ getManagerSummary: vi.fn() }));
vi.mock('@/services/staff/list-staff', () => ({ listOperators: vi.fn() }));

import { managerRoutes } from '@/lib/mobile-api/routes/manager';

import type { RouteContext } from '@/lib/mobile-api/router';
import type { Profile } from '@/lib/types';

const route = (method: string, path: string) => managerRoutes.find((r) => r.method === method && r.path === path)!;
const ctx = (params: Record<string, string>, body: unknown = {}, query = ''): RouteContext => ({
  params,
  query: new URLSearchParams(query),
  body,
  profile: { id: 'mgr', role: 'manager' } as Profile,
});

beforeEach(() => vi.clearAllMocks());

describe('manager routes', () => {
  it('are manager-only', () => {
    for (const r of managerRoutes) expect(r.access).toEqual(['manager']);
  });

  it.each([undefined, 'yes', 1, null])('refuses a non-boolean active flag (%j)', async (active) => {
    const result = await route('POST', 'manager/staff/:id/active').handle(ctx({ id: 'x' }, { active }));
    expect(result).toEqual({ status: 422, error: 'errors.invalidInput' });
    expect(m.setStaffActiveAction).not.toHaveBeenCalled();
  });

  it('activates and deactivates through the website action', async () => {
    m.setStaffActiveAction.mockResolvedValue({ success: false, error: 'manager.staff.errors.cannotDeactivateSelf' });
    const result = await route('POST', 'manager/staff/:id/active').handle(ctx({ id: 'p1' }, { active: false }));
    expect(m.setStaffActiveAction).toHaveBeenCalledWith('p1', false);
    expect(result).toEqual({ status: 422, error: 'manager.staff.errors.cannotDeactivateSelf' });
  });

  it('never sends the private trade licence storage path', async () => {
    m.listMerchantApplications.mockResolvedValue({ items: [{ id: 'a', companyName: 'Co', tradeLicensePath: 'secret/path.pdf' }], page: 1, totalPages: 1, total: 1 });
    m.countMerchantApplicationsByStatus.mockResolvedValue({});
    const result = (await route('GET', 'manager/merchants').handle(ctx({}, {}, 'status=bogus'))) as { data: { items: object[] } };
    expect(m.listMerchantApplications).toHaveBeenCalledWith('all', 1);
    expect(result.data.items[0]).not.toHaveProperty('tradeLicensePath');
  });

  it('bounds the report range like the website page', async () => {
    m.getReportData.mockResolvedValue({
      range: { fromParam: '2026-01-01', toParam: '2026-01-31' },
      shipments: {},
      revenue: {},
      drivers: Array.from({ length: 30 }, (_, i) => ({ driverId: String(i) })),
      customers: [],
      trend: [],
    });
    const result = (await route('GET', 'manager/reports').handle(ctx({}, {}, 'from=nonsense&to=2026-01-31'))) as {
      data: { drivers: unknown[] };
    };
    const [range] = m.getReportData.mock.calls[0] as [{ from: Date; to: Date }];
    expect(range.from).toBeInstanceOf(Date);
    expect(result.data.drivers).toHaveLength(10);
  });
});
