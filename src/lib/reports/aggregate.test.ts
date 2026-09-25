import { describe, expect, it } from 'vitest';

import {
  buildCustomerReport,
  buildDailyTrend,
  buildDriverReport,
  buildRevenueReport,
  buildShipmentReport,
} from '@/lib/reports/aggregate';

import type { ReportShipmentRow } from '@/lib/reports/aggregate';

const row = (overrides: Partial<ReportShipmentRow>): ReportShipmentRow => ({
  id: Math.random().toString(36),
  status: 'delivered',
  price: 10,
  paymentMethod: 'card',
  paymentStatus: 'paid',
  customerId: 'c1',
  driverId: 'd1',
  createdAt: '2026-09-01T10:00:00.000Z',
  ...overrides,
});

describe('buildShipmentReport', () => {
  it('counts each outcome bucket', () => {
    const report = buildShipmentReport([
      row({ status: 'delivered' }),
      row({ status: 'in_transit' }),
      row({ status: 'pending_payment' }),
      row({ status: 'delivery_failed' }),
      row({ status: 'cancelled' }),
      row({ status: 'returned' }),
    ]);
    expect(report).toEqual({ total: 6, delivered: 1, pending: 2, failed: 1, cancelled: 1, returned: 1 });
  });
});

describe('buildRevenueReport', () => {
  it('recognises paid card + delivered COD, and tracks outstanding/refunds', () => {
    const report = buildRevenueReport([
      row({ paymentMethod: 'card', paymentStatus: 'paid', price: 20 }),
      row({ paymentMethod: 'cod', paymentStatus: 'pending', status: 'delivered', price: 15 }),
      row({ paymentMethod: 'cod', paymentStatus: 'pending', status: 'in_transit', price: 12 }),
      row({ paymentMethod: 'card', paymentStatus: 'pending', status: 'pending_payment', price: 30 }),
      row({ paymentMethod: 'card', paymentStatus: 'pending', status: 'cancelled', price: 99 }),
      row({ paymentMethod: 'card', paymentStatus: 'refunded', price: 8 }),
    ]);
    expect(report).toEqual({ cardRevenue: 20, codRevenue: 15, deliveryRevenue: 35, refunds: 8, outstanding: 42 });
  });

  it('avoids floating point drift', () => {
    const report = buildRevenueReport([row({ price: 0.1 }), row({ price: 0.2 })]);
    expect(report.cardRevenue).toBe(0.3);
  });
});

describe('buildDriverReport', () => {
  it('computes per-driver counts, success rate and collected COD', () => {
    const report = buildDriverReport(
      [
        row({ driverId: 'd1', status: 'delivered' }),
        row({ driverId: 'd1', status: 'delivered' }),
        row({ driverId: 'd1', status: 'delivery_failed' }),
        row({ driverId: 'd1', status: 'in_transit' }),
        row({ driverId: 'd2', status: 'assigned' }),
        row({ driverId: null, status: 'confirmed' }),
      ],
      [
        { driverId: 'd1', amount: 15, status: 'collected' },
        { driverId: 'd1', amount: 5, status: 'expected' },
      ],
    );
    expect(report[0]).toEqual({ driverId: 'd1', deliveries: 4, delivered: 2, failed: 1, successRate: 67, codCollected: 15 });
    expect(report[1]).toMatchObject({ driverId: 'd2', successRate: 0 });
    expect(report).toHaveLength(2);
  });
});

describe('buildCustomerReport', () => {
  it('groups by customer and sorts by spend', () => {
    const report = buildCustomerReport([
      row({ customerId: 'a', price: 10 }),
      row({ customerId: 'b', price: 50 }),
      row({ customerId: 'b', paymentMethod: 'cod', paymentStatus: 'pending', status: 'in_transit', price: 7 }),
    ]);
    expect(report.map((r) => r.customerId)).toEqual(['b', 'a']);
    expect(report[0]).toEqual({ customerId: 'b', shipments: 2, totalSpent: 50, codAmount: 7, outstanding: 7 });
  });
});

describe('buildDailyTrend', () => {
  it('emits every day in range including empty ones', () => {
    const trend = buildDailyTrend(
      [row({ createdAt: '2026-09-01T09:00:00Z' }), row({ createdAt: '2026-09-03T09:00:00Z', status: 'in_transit' })],
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-09-03T00:00:00Z'),
    );
    expect(trend).toEqual([
      { date: '2026-09-01', shipments: 1, delivered: 1 },
      { date: '2026-09-02', shipments: 0, delivered: 0 },
      { date: '2026-09-03', shipments: 1, delivered: 0 },
    ]);
  });
});
