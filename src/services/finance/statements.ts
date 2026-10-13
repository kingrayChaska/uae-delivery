import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/security/validate';

import type {
  Settlement,
  SettlementMethod,
  Statement,
  StatementBalance,
  StatementKind,
  StatementLine,
  StatementMerchant,
  StatementOutcome,
  StatementStatus,
  StatementSummaryRecord,
} from '@/lib/finance/statements';
import type { DeliveryType, PaymentMethod, RecipientPaymentType } from '@/lib/types';

// Every read uses the caller's own session. merchant_statements_select
// (migration 0044) lets a manager see every statement and a merchant only
// the published ones of their own business — a draft, or another
// merchant's statement, simply isn't found. Nothing here decides access.

type Numeric = number | string;

type StatementRow = {
  id: string;
  statement_number: string | null;
  business_account_id: string;
  merchant: StatementMerchant;
  period_start: string;
  period_end: string;
  status: StatementStatus;
  version: number;
  kind: StatementKind;
  outcome: StatementOutcome;
  net_amount: Numeric;
  currency: string;
  line_count: number;
  generated_at: string;
  published_at: string | null;
};

type StatementDetailRow = StatementRow & {
  supersedes_id: string | null;
  superseded_by_id: string | null;
  superseded_at: string | null;
  correction_reason: string | null;
  return_charge_rate: Numeric;
  cash_handling_rate: Numeric;
  rates_vary: boolean;
  delivered_count: number;
  returned_count: number;
  total_cod: Numeric;
  cod_already_remitted: Numeric;
  service_charges: Numeric;
  return_charges: Numeric;
  cash_handling_base: Numeric;
  cash_handling_fee: Numeric;
  payments_received: Numeric;
  cod_unverified: Numeric;
  cod_uncollected: Numeric;
  fees_unverified: Numeric;
};

type LineRow = {
  line_number: number;
  shipment_id: string;
  tracking_number: string;
  event: 'delivered' | 'returned';
  event_at: string;
  recipient_name: string;
  delivery_type: DeliveryType | null;
  payment_method: PaymentMethod;
  recipient_payment_type: RecipientPaymentType;
  price: Numeric;
  service_charge: Numeric;
  return_charge: Numeric;
  cod_collected: Numeric;
  cod_unverified: Numeric;
  cod_uncollected: Numeric;
  cash_handling_fee: Numeric;
  payments_received: Numeric;
  fees_unverified: Numeric;
  cod_remitted: Numeric;
  currency: string;
  return_charge_rate: Numeric;
  cash_handling_rate: Numeric;
};

type SettlementRow = {
  id: string;
  statement_id: string;
  direction: Settlement['direction'];
  amount: Numeric;
  method: SettlementMethod;
  reference: string | null;
  notes: string | null;
  paid_on: string;
  status: Settlement['status'];
  void_reason: string | null;
  created_at: string;
};

const SUMMARY_SELECT =
  'id, statement_number, business_account_id, merchant, period_start, period_end, status, version, kind, outcome, net_amount, currency, line_count, generated_at, published_at';

const DETAIL_SELECT = `${SUMMARY_SELECT}, supersedes_id, superseded_by_id, superseded_at, correction_reason, return_charge_rate, cash_handling_rate, rates_vary, delivered_count, returned_count, total_cod, cod_already_remitted, service_charges, return_charges, cash_handling_base, cash_handling_fee, payments_received, cod_unverified, cod_uncollected, fees_unverified`;

const LINE_SELECT =
  'line_number, shipment_id, tracking_number, event, event_at, recipient_name, delivery_type, payment_method, recipient_payment_type, price, service_charge, return_charge, cod_collected, cod_unverified, cod_uncollected, cash_handling_fee, payments_received, fees_unverified, cod_remitted, currency, return_charge_rate, cash_handling_rate';

// PostgREST returns at most 1,000 rows per request.
const LINE_PAGE = 1000;
export const STATEMENT_PAGE_SIZE = 25;

const num = (value: Numeric) => Number(value);

const toSummary = (row: StatementRow): StatementSummaryRecord => ({
  id: row.id,
  statementNumber: row.statement_number,
  businessAccountId: row.business_account_id,
  merchantName: row.merchant?.name ?? '',
  periodStart: row.period_start,
  periodEnd: row.period_end,
  status: row.status,
  version: row.version,
  kind: row.kind,
  outcome: row.outcome,
  netAmount: num(row.net_amount),
  currency: row.currency,
  lineCount: row.line_count,
  generatedAt: row.generated_at,
  publishedAt: row.published_at,
});

const toLine = (row: LineRow): StatementLine => ({
  lineNumber: row.line_number,
  shipmentId: row.shipment_id,
  trackingNumber: row.tracking_number,
  event: row.event,
  eventAt: row.event_at,
  recipientName: row.recipient_name,
  deliveryType: row.delivery_type,
  paymentMethod: row.payment_method,
  recipientPaymentType: row.recipient_payment_type,
  price: num(row.price),
  serviceCharge: num(row.service_charge),
  returnCharge: num(row.return_charge),
  codCollected: num(row.cod_collected),
  codUnverified: num(row.cod_unverified),
  codUncollected: num(row.cod_uncollected),
  cashHandlingFee: num(row.cash_handling_fee),
  paymentsReceived: num(row.payments_received),
  feesUnverified: num(row.fees_unverified),
  codRemitted: num(row.cod_remitted),
  currency: row.currency,
  returnChargeRate: num(row.return_charge_rate),
  cashHandlingRate: num(row.cash_handling_rate),
});

export type StatementListFilters = {
  businessAccountId?: string | null;
  status?: StatementStatus | null;
  page?: number;
};

export const listStatements = async ({
  businessAccountId,
  status,
  page = 1,
}: StatementListFilters = {}): Promise<{ rows: StatementSummaryRecord[]; total: number }> => {
  const supabase = await createClient();
  const from = (page - 1) * STATEMENT_PAGE_SIZE;
  let query = supabase
    .from('merchant_statements')
    .select(SUMMARY_SELECT, { count: 'exact' })
    .order('period_end', { ascending: false })
    .order('generated_at', { ascending: false })
    .range(from, from + STATEMENT_PAGE_SIZE - 1);
  if (businessAccountId && isUuid(businessAccountId)) query = query.eq('business_account_id', businessAccountId);
  if (status) query = query.eq('status', status);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: ((data ?? []) as StatementRow[]).map(toSummary), total: count ?? 0 };
};

// The statement and all its lines, or null when there's no such statement
// or the caller may not see it. Throws when the database can't be read.
export const getStatement = async (id: string): Promise<Statement | null> => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();

  const { data, error } = await supabase.from('merchant_statements').select(DETAIL_SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as StatementDetailRow;

  const lines: StatementLine[] = [];
  for (let from = 0; ; from += LINE_PAGE) {
    const { data: lineRows, error: lineError } = await supabase
      .from('merchant_statement_lines')
      .select(LINE_SELECT)
      .eq('statement_id', row.id)
      .order('line_number', { ascending: true })
      .range(from, from + LINE_PAGE - 1);
    if (lineError) throw new Error(lineError.message);
    lines.push(...((lineRows ?? []) as LineRow[]).map(toLine));
    if (!lineRows || lineRows.length < LINE_PAGE) break;
  }

  // This statement and every statement it corrected: payments recorded on
  // any of them count towards this one's balance (migration 0045).
  const { data: chainRows, error: chainError } = await supabase.rpc('merchant_statement_chain', { p_statement_id: row.id });
  if (chainError) throw new Error(chainError.message);
  const chain = ((chainRows ?? []) as { statement_id: string }[]).map((r) => r.statement_id);

  // The numbers of related statements, as far as the caller may see them
  // (a merchant never sees a draft).
  const related = [...new Set([row.supersedes_id, row.superseded_by_id, ...chain].filter((value): value is string => Boolean(value)))];
  const numbers = new Map<string, string | null>();
  if (related.length) {
    const { data: relatedRows } = await supabase.from('merchant_statements').select('id, statement_number').in('id', related);
    for (const r of (relatedRows ?? []) as { id: string; statement_number: string | null }[]) numbers.set(r.id, r.statement_number);
  }

  const [{ data: settlementRows, error: settlementError }, { data: balanceRow, error: balanceError }] = await Promise.all([
    supabase
      .from('merchant_statement_settlements')
      .select('id, statement_id, direction, amount, method, reference, notes, paid_on, status, void_reason, created_at')
      .in('statement_id', chain.length ? chain : [row.id])
      .order('paid_on', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase.rpc('merchant_statement_balance', { p_statement_id: row.id }).maybeSingle(),
  ]);
  if (settlementError) throw new Error(settlementError.message);
  if (balanceError) throw new Error(balanceError.message);
  const b = balanceRow as { paid_to_merchant: Numeric; paid_by_merchant: Numeric; balance: Numeric; settlement_status: StatementBalance['status'] } | null;
  const balance: StatementBalance = b
    ? { paidToMerchant: num(b.paid_to_merchant), paidByMerchant: num(b.paid_by_merchant), balance: num(b.balance), status: b.settlement_status }
    : { paidToMerchant: 0, paidByMerchant: 0, balance: num(row.net_amount), status: num(row.net_amount) === 0 ? 'settled' : 'open' };

  return {
    ...toSummary(row),
    merchant: row.merchant,
    supersedesId: row.supersedes_id,
    supersedesNumber: row.supersedes_id ? (numbers.get(row.supersedes_id) ?? null) : null,
    supersededById: row.superseded_by_id,
    supersededByNumber: row.superseded_by_id ? (numbers.get(row.superseded_by_id) ?? null) : null,
    supersededAt: row.superseded_at,
    correctionReason: row.correction_reason,
    returnChargeRate: num(row.return_charge_rate),
    cashHandlingRate: num(row.cash_handling_rate),
    ratesVary: row.rates_vary,
    deliveredCount: row.delivered_count,
    returnedCount: row.returned_count,
    totalCod: num(row.total_cod),
    codAlreadyRemitted: num(row.cod_already_remitted),
    serviceCharges: num(row.service_charges),
    returnCharges: num(row.return_charges),
    cashHandlingBase: num(row.cash_handling_base),
    cashHandlingFee: num(row.cash_handling_fee),
    paymentsReceived: num(row.payments_received),
    codUnverified: num(row.cod_unverified),
    codUncollected: num(row.cod_uncollected),
    feesUnverified: num(row.fees_unverified),
    lines,
    settlements: ((settlementRows ?? []) as SettlementRow[]).map((r) => ({
      id: r.id,
      statementId: r.statement_id,
      statementNumber: numbers.get(r.statement_id) ?? null,
      direction: r.direction,
      amount: num(r.amount),
      method: r.method,
      reference: r.reference,
      notes: r.notes,
      paidOn: r.paid_on,
      status: r.status,
      voidReason: r.void_reason,
      createdAt: r.created_at,
    })),
    balance,
  };
};

// Merchants (business accounts) a manager can generate a statement for.
export const listStatementMerchants = async (): Promise<{ id: string; name: string; active: boolean }[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('business_accounts')
    .select('id, company_name, active')
    .order('active', { ascending: false })
    .order('company_name', { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; company_name: string; active: boolean }[]).map((row) => ({
    id: row.id,
    name: row.company_name,
    active: row.active,
  }));
};
