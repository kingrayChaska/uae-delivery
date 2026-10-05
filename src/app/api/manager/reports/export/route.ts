import { NextResponse } from 'next/server';

import { getCurrentProfile } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv/serialize';
import { parseReportRange } from '@/lib/reports/range';
import { getReportData } from '@/services/reports/get-report-data';
import { listAllCodTransactions } from '@/services/cod/list-all-cod';

import type { NextRequest } from 'next/server';

const REPORT_TYPES = ['shipments', 'drivers', 'revenue', 'customers', 'daily', 'cod'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

// Manager-only. Returns 404 rather than 401/403 for anyone else so the
// endpoint's existence isn't advertised. The proxy doesn't cover /api
// role checks, so this handler does its own.
export const GET = async (request: NextRequest) => {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'manager') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as ReportType | null;
  if (!type || !REPORT_TYPES.includes(type)) {
    return new NextResponse('Unknown report type', { status: 400 });
  }

  const range = parseReportRange(searchParams.get('from'), searchParams.get('to'));
  const data = await getReportData(range);

  let csv: string;
  switch (type) {
    case 'shipments':
      csv = toCsv(
        ['Metric', 'Count'],
        Object.entries(data.shipments).map(([metric, count]) => [metric, count]),
      );
      break;
    case 'revenue':
      csv = toCsv(
        ['Metric', 'Amount (AED)'],
        Object.entries(data.revenue).map(([metric, amount]) => [metric, amount.toFixed(2)]),
      );
      break;
    case 'drivers':
      csv = toCsv(
        ['Driver', 'Deliveries', 'Delivered', 'Failed', 'Success rate (%)', 'COD collected (AED)'],
        data.drivers.map((d) => [d.name, d.deliveries, d.delivered, d.failed, d.successRate, d.codCollected.toFixed(2)]),
      );
      break;
    case 'customers':
      csv = toCsv(
        ['Customer', 'Shipments', 'Total spent (AED)', 'COD (AED)', 'Outstanding (AED)'],
        data.customers.map((c) => [c.name, c.shipments, c.totalSpent.toFixed(2), c.codAmount.toFixed(2), c.outstanding.toFixed(2)]),
      );
      break;
    case 'daily':
      csv = toCsv(
        ['Date', 'Shipments', 'Delivered'],
        data.trend.map((d) => [d.date, d.shipments, d.delivered]),
      );
      break;
    case 'cod': {
      const codRows = await listAllCodTransactions();
      csv = toCsv(
        ['Tracking', 'Driver', 'From recipient', 'Delivery fee (cash)', 'Total', 'Status', 'Collected at', 'Reconciled at'],
        codRows.map((r) => [
          r.trackingNumber,
          r.driverName,
          r.productAmount.toFixed(2),
          r.deliveryFeeAmount.toFixed(2),
          r.amount.toFixed(2),
          r.status,
          r.collectedAt ?? '',
          r.reconciledAt ?? '',
        ]),
      );
      break;
    }
  }

  const filename = `${type}-report_${range.fromParam}_to_${range.toParam}.csv`;
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};
