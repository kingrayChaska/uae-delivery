import type { ShipmentStatus } from '@/lib/types';

// Pure aggregation over already-fetched rows, so the report math is unit
// tested independently of Supabase. Services fetch; these functions count.

export type ReportShipmentRow = {
  id: string;
  status: ShipmentStatus;
  price: number;
  paymentMethod: 'card' | 'cod';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  customerId: string;
  driverId: string | null;
  createdAt: string;
};

export type ReportCodRow = {
  driverId: string | null;
  amount: number;
  status: 'expected' | 'collected' | 'reconciled' | 'remitted';
};

export type ShipmentReport = {
  total: number;
  delivered: number;
  pending: number;
  failed: number;
  cancelled: number;
  returned: number;
};

const IN_FLIGHT: ShipmentStatus[] = [
  'pending_payment',
  'confirmed',
  'assigned',
  'driver_accepted',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
];

export const buildShipmentReport = (rows: ReportShipmentRow[]): ShipmentReport => ({
  total: rows.length,
  delivered: rows.filter((r) => r.status === 'delivered').length,
  pending: rows.filter((r) => IN_FLIGHT.includes(r.status)).length,
  failed: rows.filter((r) => r.status === 'delivery_failed').length,
  cancelled: rows.filter((r) => r.status === 'cancelled').length,
  returned: rows.filter((r) => r.status === 'returned').length,
});

export type RevenueReport = {
  cardRevenue: number;
  codRevenue: number;
  deliveryRevenue: number;
  refunds: number;
  outstanding: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

// Revenue is recognised when money is actually in hand: card payments
// marked paid, and COD once the delivery completed. Outstanding is what's
// owed on shipments that aren't cancelled and haven't been paid yet.
export const buildRevenueReport = (rows: ReportShipmentRow[]): RevenueReport => {
  const cardRevenue = rows
    .filter((r) => r.paymentMethod === 'card' && r.paymentStatus === 'paid')
    .reduce((sum, r) => sum + r.price, 0);
  const codRevenue = rows
    .filter((r) => r.paymentMethod === 'cod' && r.status === 'delivered')
    .reduce((sum, r) => sum + r.price, 0);
  const refunds = rows.filter((r) => r.paymentStatus === 'refunded').reduce((sum, r) => sum + r.price, 0);
  const outstanding = rows
    .filter((r) => r.status !== 'cancelled' && r.paymentStatus !== 'paid' && r.paymentStatus !== 'refunded')
    .filter((r) => !(r.paymentMethod === 'cod' && r.status === 'delivered'))
    .reduce((sum, r) => sum + r.price, 0);

  return {
    cardRevenue: round2(cardRevenue),
    codRevenue: round2(codRevenue),
    deliveryRevenue: round2(cardRevenue + codRevenue),
    refunds: round2(refunds),
    outstanding: round2(outstanding),
  };
};

export type DriverReportRow = {
  driverId: string;
  deliveries: number;
  delivered: number;
  failed: number;
  successRate: number;
  codCollected: number;
};

export const buildDriverReport = (shipments: ReportShipmentRow[], cod: ReportCodRow[]): DriverReportRow[] => {
  const byDriver = new Map<string, DriverReportRow>();

  for (const shipment of shipments) {
    if (!shipment.driverId) continue;
    const row = byDriver.get(shipment.driverId) ?? {
      driverId: shipment.driverId,
      deliveries: 0,
      delivered: 0,
      failed: 0,
      successRate: 0,
      codCollected: 0,
    };
    row.deliveries += 1;
    if (shipment.status === 'delivered') row.delivered += 1;
    if (shipment.status === 'delivery_failed') row.failed += 1;
    byDriver.set(shipment.driverId, row);
  }

  for (const entry of cod) {
    if (!entry.driverId || entry.status === 'expected') continue;
    const row = byDriver.get(entry.driverId);
    if (row) row.codCollected = round2(row.codCollected + entry.amount);
  }

  return [...byDriver.values()]
    .map((row) => {
      const attempted = row.delivered + row.failed;
      return { ...row, successRate: attempted === 0 ? 0 : Math.round((row.delivered / attempted) * 100) };
    })
    .sort((a, b) => b.deliveries - a.deliveries);
};

export type CustomerReportRow = {
  customerId: string;
  shipments: number;
  totalSpent: number;
  codAmount: number;
  outstanding: number;
};

export const buildCustomerReport = (rows: ReportShipmentRow[]): CustomerReportRow[] => {
  const byCustomer = new Map<string, ReportShipmentRow[]>();
  for (const row of rows) {
    byCustomer.set(row.customerId, [...(byCustomer.get(row.customerId) ?? []), row]);
  }

  return [...byCustomer.entries()]
    .map(([customerId, shipments]) => {
      const revenue = buildRevenueReport(shipments);
      return {
        customerId,
        shipments: shipments.length,
        totalSpent: revenue.deliveryRevenue,
        codAmount: round2(shipments.filter((s) => s.paymentMethod === 'cod').reduce((sum, s) => sum + s.price, 0)),
        outstanding: revenue.outstanding,
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);
};

// Daily buckets for the trend chart; every day in the range appears, even
// with zero shipments, so the chart doesn't silently skip gaps.
export const buildDailyTrend = (
  rows: ReportShipmentRow[],
  from: Date,
  to: Date,
): { date: string; shipments: number; delivered: number }[] => {
  const days: { date: string; shipments: number; delivered: number }[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  while (cursor <= end && days.length < 366) {
    days.push({ date: cursor.toISOString().slice(0, 10), shipments: 0, delivered: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const index = new Map(days.map((day, i) => [day.date, i]));
  for (const row of rows) {
    const i = index.get(row.createdAt.slice(0, 10));
    if (i === undefined) continue;
    days[i].shipments += 1;
    if (row.status === 'delivered') days[i].delivered += 1;
  }

  return days;
};
