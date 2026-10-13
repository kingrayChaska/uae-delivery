import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { Period, ProfitGroup } from '@/lib/finance/schemas';
import type { DeliveryType, PaymentMethod } from '@/lib/types';

// The business performance report (migration 0044). Every figure —
// revenue, expenditure, the four stepwise profits, net operating profit and
// the break-even gap — is computed in the database in numeric, by
// business_performance_summary(); this only converts it for display.

type Numeric = number | string;

export type PerformanceSummary = {
  merchantServiceRevenue: number;
  merchantReturnRevenue: number;
  merchantCashHandlingRevenue: number;
  individualRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  merchantCodCollected: number;
  deliveredCount: number;
  merchantDeliveredCount: number;
  individualDeliveredCount: number;
  returnedCount: number;
  fuel: number;
  subscription: number;
  salary: number;
  rent: number;
  otherExpenses: number;
  totalExpenditure: number;
  expenseCount: number;
  profitAfterFuel: number;
  profitAfterSubscription: number;
  profitAfterSalary: number;
  profitAfterRent: number;
  netOperatingProfit: number;
  breakEvenRevenue: number;
  breakEvenGap: number;
};

export type CategoryTotal = {
  categoryId: string;
  name: string;
  profitGroup: ProfitGroup;
  isSystem: boolean;
  active: boolean;
  total: number;
  expenseCount: number;
};

export type RevenueLine = {
  shipmentId: string;
  trackingNumber: string;
  isMerchant: boolean;
  event: 'delivered' | 'returned';
  eventAt: string;
  recipientName: string;
  deliveryType: DeliveryType | null;
  paymentMethod: PaymentMethod;
  serviceCharge: number;
  returnCharge: number;
  cashHandlingFee: number;
  codCollected: number;
};

const camel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export const getPerformanceSummary = async ({ from, to }: Period): Promise<PerformanceSummary> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('business_performance_summary', { p_from: from, p_to: to }).single();
  if (error || !data) throw new Error(error?.message ?? 'No performance data');
  return Object.fromEntries(Object.entries(data as Record<string, Numeric>).map(([key, value]) => [camel(key), Number(value)])) as PerformanceSummary;
};

export const getCategoryTotals = async ({ from, to }: Period): Promise<CategoryTotal[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('expense_category_totals', { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as {
      category_id: string;
      name: string;
      profit_group: ProfitGroup;
      is_system: boolean;
      active: boolean;
      total: Numeric;
      expense_count: Numeric;
    }[]
  ).map((row) => ({
    categoryId: row.category_id,
    name: row.name,
    profitGroup: row.profit_group,
    isSystem: row.is_system,
    active: row.active,
    total: Number(row.total),
    expenseCount: Number(row.expense_count),
  }));
};

// The shipments behind the revenue figures (drill-down), from the same
// calculation the totals use. Read in pages of 1,000 up to `limit`.
export const getRevenueLines = async ({ from, to }: Period, limit = 5000): Promise<RevenueLine[]> => {
  const supabase = await createClient();
  const lines: RevenueLine[] = [];
  for (let start = 0; start < limit; start += 1000) {
    const { data, error } = await supabase
      .rpc('financial_shipment_lines', { p_from: from, p_to: to, p_business_account_id: null })
      .range(start, Math.min(start + 999, limit - 1));
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const row of rows) {
      lines.push({
        shipmentId: row.shipment_id as string,
        trackingNumber: row.tracking_number as string,
        isMerchant: row.is_merchant as boolean,
        event: row.event as 'delivered' | 'returned',
        eventAt: row.event_at as string,
        recipientName: row.recipient_name as string,
        deliveryType: row.delivery_type as DeliveryType | null,
        paymentMethod: row.payment_method as PaymentMethod,
        serviceCharge: Number(row.service_charge),
        returnCharge: Number(row.return_charge),
        cashHandlingFee: Number(row.cash_handling_fee),
        codCollected: Number(row.cod_collected),
      });
    }
    if (rows.length < 1000) break;
  }
  return lines;
};
