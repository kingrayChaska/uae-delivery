import 'server-only';

import { createClient } from '@/lib/supabase/server';
import {
  buildCustomerReport,
  buildDailyTrend,
  buildDriverReport,
  buildRevenueReport,
  buildShipmentReport,
} from '@/lib/reports/aggregate';
import { rangeEndExclusive } from '@/lib/reports/range';

import type { ReportCodRow, ReportShipmentRow } from '@/lib/reports/aggregate';
import type { ReportRange } from '@/lib/reports/range';

export type ReportData = {
  range: ReportRange;
  shipments: ReturnType<typeof buildShipmentReport>;
  revenue: ReturnType<typeof buildRevenueReport>;
  drivers: (ReturnType<typeof buildDriverReport>[number] & { name: string })[];
  customers: (ReturnType<typeof buildCustomerReport>[number] & { name: string })[];
  trend: ReturnType<typeof buildDailyTrend>;
};

const REPORT_ROW_CAP = 20_000;

// All staff-readable via RLS; callers (page + export route) additionally
// require the manager role. Fetches raw rows once, then the pure functions
// in lib/reports/aggregate.ts do all the counting.
export const getReportData = async (range: ReportRange): Promise<ReportData> => {
  const supabase = await createClient();
  const fromIso = range.from.toISOString();
  const toIso = rangeEndExclusive(range).toISOString();

  const [{ data: shipmentRows }, { data: codRows }, { data: profileRows }] = await Promise.all([
    supabase
      .from('shipments')
      .select('id, status, price, payment_method, payment_status, customer_id, driver_id, created_at')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .limit(REPORT_ROW_CAP),
    supabase
      .from('cod_transactions')
      .select('driver_id, amount, status')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .limit(REPORT_ROW_CAP),
    supabase.from('profiles').select('id, full_name').in('role', ['customer', 'driver']),
  ]);

  const rows: ReportShipmentRow[] = (shipmentRows ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    price: Number(row.price),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    customerId: row.customer_id,
    driverId: row.driver_id,
    createdAt: row.created_at,
  }));
  const cod: ReportCodRow[] = (codRows ?? []).map((row) => ({
    driverId: row.driver_id,
    amount: Number(row.amount),
    status: row.status,
  }));
  const names = new Map((profileRows ?? []).map((p) => [p.id, p.full_name as string]));

  return {
    range,
    shipments: buildShipmentReport(rows),
    revenue: buildRevenueReport(rows),
    drivers: buildDriverReport(rows, cod).map((r) => ({ ...r, name: names.get(r.driverId) ?? 'Driver' })),
    customers: buildCustomerReport(rows).map((r) => ({ ...r, name: names.get(r.customerId) ?? 'Customer' })),
    trend: buildDailyTrend(rows, range.from, range.to),
  };
};
