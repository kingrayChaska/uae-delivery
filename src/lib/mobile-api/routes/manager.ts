import 'server-only';

import { parsePeriod } from '@/lib/finance/schemas';
import { MANAGER, fail, fromAction, ok } from '@/lib/mobile-api/router';
import { parsePage } from '@/lib/pagination';
import { parseReportRange } from '@/lib/reports/range';
import { setStaffActiveAction } from '@/lib/staff/actions';
import { MERCHANT_STATUSES } from '@/lib/types';
import { listAuditLogs } from '@/services/audit/list-audit-logs';
import { getPerformanceSummary } from '@/services/finance/performance';
import { listStatements } from '@/services/finance/statements';
import { countMerchantApplicationsByStatus, listMerchantApplications } from '@/services/merchant/applications';
import { getReportData } from '@/services/reports/get-report-data';
import { getManagerSummary } from '@/services/shipments/get-manager-summary';
import { listOperators } from '@/services/staff/list-staff';

import type { MobileRoute, RouteContext } from '@/lib/mobile-api/router';
import type { MerchantStatus } from '@/lib/types';

// Manager-only screens. Every figure is the website's own: report counts
// from lib/reports/aggregate.ts, financial performance and statements from
// the database functions (migrations 0044–0045). The app shows them; it
// never adds money up itself.

const param = (ctx: RouteContext, name: string) => ctx.query.get(name) ?? undefined;
// How many driver / customer rows a phone screen shows; the full tables
// (and CSV exports) stay on the website.
const TOP_ROWS = 10;

export const managerRoutes: readonly MobileRoute[] = [
  {
    method: 'GET',
    path: 'manager/summary',
    access: MANAGER,
    handle: async () => ok(await getManagerSummary()),
  },
  {
    method: 'GET',
    path: 'manager/operators',
    access: MANAGER,
    handle: async () => ok(await listOperators()),
  },
  {
    // Activate / deactivate an operator or driver account: the website's
    // action (profile flag, sign-in ban, driver set offline, audit log).
    method: 'POST',
    path: 'manager/staff/:id/active',
    access: MANAGER,
    handle: async (ctx) => {
      const active = (ctx.body as { active?: unknown } | null)?.active;
      if (typeof active !== 'boolean') return fail(422, 'errors.invalidInput');
      return fromAction(await setStaffActiveAction(ctx.params.id, active));
    },
  },
  {
    method: 'GET',
    path: 'manager/merchants',
    access: MANAGER,
    handle: async (ctx) => {
      const raw = param(ctx, 'status');
      const status = (MERCHANT_STATUSES as readonly string[]).includes(raw ?? '') ? (raw as MerchantStatus) : 'all';
      const [list, counts] = await Promise.all([
        listMerchantApplications(status, parsePage(param(ctx, 'page'))),
        countMerchantApplicationsByStatus(),
      ]);
      // The trade licence path is a private storage key; the app doesn't need it.
      const items = list.items.map((item) => {
        const visible: Partial<typeof item> = { ...item };
        delete visible.tradeLicensePath;
        return visible;
      });
      return ok({ ...list, items, counts });
    },
  },
  {
    // ?from=&to= (YYYY-MM-DD), bounded to a year like the website's page.
    method: 'GET',
    path: 'manager/reports',
    access: MANAGER,
    handle: async (ctx) => {
      const report = await getReportData(parseReportRange(param(ctx, 'from'), param(ctx, 'to')));
      return ok({
        range: { from: report.range.fromParam, to: report.range.toParam },
        shipments: report.shipments,
        revenue: report.revenue,
        drivers: report.drivers.slice(0, TOP_ROWS),
        customers: report.customers.slice(0, TOP_ROWS),
        trend: report.trend,
      });
    },
  },
  {
    method: 'GET',
    path: 'manager/performance',
    access: MANAGER,
    handle: async (ctx) => {
      const period = parsePeriod(param(ctx, 'from'), param(ctx, 'to'));
      return ok({ period, summary: await getPerformanceSummary(period) });
    },
  },
  {
    method: 'GET',
    path: 'manager/statements',
    access: MANAGER,
    handle: async (ctx) => ok(await listStatements({ page: parsePage(param(ctx, 'page')) })),
  },
  {
    method: 'GET',
    path: 'manager/activity',
    access: MANAGER,
    handle: async () => ok(await listAuditLogs(100)),
  },
];
