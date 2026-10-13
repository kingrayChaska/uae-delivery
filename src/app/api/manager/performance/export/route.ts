import { NextResponse } from 'next/server';

import { getCurrentProfile } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv/serialize';
import { parsePeriod } from '@/lib/finance/schemas';
import { getCategoryTotals, getPerformanceSummary, getRevenueLines } from '@/services/finance/performance';

import type { NextRequest } from 'next/server';

// The business performance report as CSV. Manager-only: 404 for anyone else
// so the endpoint isn't advertised (the database functions refuse other
// roles too). Same figures as the page — both read the same functions.
//   type=summary  revenue, expenditure by category, the four stepwise
//                 profits, net operating profit and break-even
//   type=lines    every shipment behind the revenue figures
export const GET = async (request: NextRequest) => {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active || profile.role !== 'manager') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  if (type !== 'summary' && type !== 'lines') return new NextResponse('Unknown report type', { status: 400 });
  const period = parsePeriod(searchParams.get('from'), searchParams.get('to'));
  const money = (value: number) => value.toFixed(2);

  let csv: string;
  try {
    if (type === 'summary') {
      const [s, categories] = await Promise.all([getPerformanceSummary(period), getCategoryTotals(period)]);
      csv = toCsv(
        ['Section', 'Item', 'Formula', 'Amount (AED)'],
        [
          ['Period', `${period.from} to ${period.to}`, 'Asia/Dubai calendar days; accrual basis', ''],
          ['Revenue', 'Merchant service revenue', 'Price of merchant deliveries completed', money(s.merchantServiceRevenue)],
          ['Revenue', 'Merchant return charges', '50% of original delivery service cost', money(s.merchantReturnRevenue)],
          ['Revenue', 'Merchant cash-handling fees', '1.5% of verified COD collected', money(s.merchantCashHandlingRevenue)],
          ['Revenue', 'Individual & walk-in revenue', 'Price of individual/guest deliveries completed', money(s.individualRevenue)],
          ['Revenue', 'Other approved revenue', 'None recorded', money(s.otherRevenue)],
          ['Revenue', 'Total revenue (R)', '', money(s.totalRevenue)],
          ['Memo', 'COD collected for merchants (not revenue)', '', money(s.merchantCodCollected)],
          ...categories.map((c) => ['Expenditure', c.name, `Counts as ${c.profitGroup}`, money(c.total)]),
          ['Expenditure', 'Total expenditure', '', money(s.totalExpenditure)],
          ['Profitability', 'Profit after fuel', 'R - Fuel', money(s.profitAfterFuel)],
          ['Profitability', 'Profit after fuel and subscription', 'R - Fuel - Subscription', money(s.profitAfterSubscription)],
          ['Profitability', 'Profit after fuel, subscription, and salary', 'R - Fuel - Subscription - Salary', money(s.profitAfterSalary)],
          ['Profitability', 'Profit after fuel, subscription, salary, and rent', 'R - Fuel - Subscription - Salary - Rent', money(s.profitAfterRent)],
          ['Profitability', 'Net operating profit', 'R - all operating expenses', money(s.netOperatingProfit)],
          ['Break-even', 'Break-even revenue target', 'Total operating expenditure', money(s.breakEvenRevenue)],
          ['Break-even', 'Additional revenue required', 'max(0, expenditure - R)', money(s.breakEvenGap)],
        ],
      );
    } else {
      const lines = await getRevenueLines(period, 100_000);
      csv = toCsv(
        ['Completed at', 'Tracking ID', 'Customer type', 'Outcome', 'Service charge (AED)', 'Return charge (AED)', 'Cash-handling fee (AED)', 'COD collected for merchant (AED)'],
        lines.map((line) => [
          line.eventAt,
          line.trackingNumber,
          line.isMerchant ? 'Merchant' : 'Individual / walk-in',
          line.event,
          money(line.serviceCharge),
          money(line.returnCharge),
          money(line.cashHandlingFee),
          money(line.codCollected),
        ]),
      );
    }
  } catch (error) {
    console.error('Performance export failed', error instanceof Error ? error.message : error);
    return new NextResponse('Something went wrong', { status: 500 });
  }

  return new NextResponse(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="performance-${type}_${period.from}_to_${period.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
