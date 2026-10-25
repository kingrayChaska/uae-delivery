import { amountInWords } from '@/lib/finance/amount-in-words';

import type { DeliveryType, PaymentMethod, RecipientPaymentType } from '@/lib/types';

// Merchant account statements (migration 0044). Every value is the snapshot
// stored when the statement was generated — nothing here recalculates a
// figure. statementSummary() only arranges the stored totals for reading,
// and it is the one arrangement used by the manager preview, the merchant
// portal and the PDF, so the three can't disagree.

export const STATEMENT_STATUSES = ['draft', 'published', 'superseded'] as const;
export type StatementStatus = (typeof STATEMENT_STATUSES)[number];

export type StatementOutcome = 'payable_to_merchant' | 'due_from_merchant' | 'settled';
export type StatementKind = 'cod_remittance' | 'service_charges';

export type StatementMerchant = {
  name: string;
  accountId?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  trn?: string;
  registrationNumber?: string;
  licenseNumber?: string;
};

export type StatementLine = {
  lineNumber: number;
  shipmentId: string;
  trackingNumber: string;
  event: 'delivered' | 'returned';
  eventAt: string;
  recipientName: string;
  deliveryType: DeliveryType | null;
  paymentMethod: PaymentMethod;
  recipientPaymentType: RecipientPaymentType;
  price: number;
  serviceCharge: number;
  returnCharge: number;
  codCollected: number;
  codUnverified: number;
  codUncollected: number;
  cashHandlingFee: number;
  paymentsReceived: number;
  feesUnverified: number;
  codRemitted: number;
  currency: string;
  // The rates in force on the day this shipment was completed (0045).
  returnChargeRate: number;
  cashHandlingRate: number;
};

export type StatementSummaryRecord = {
  id: string;
  statementNumber: string | null;
  businessAccountId: string;
  merchantName: string;
  periodStart: string;
  periodEnd: string;
  status: StatementStatus;
  version: number;
  kind: StatementKind;
  outcome: StatementOutcome;
  netAmount: number;
  currency: string;
  lineCount: number;
  generatedAt: string;
  publishedAt: string | null;
};

export type Statement = StatementSummaryRecord & {
  accountingVersion: 1 | 2;
  merchant: StatementMerchant;
  supersedesId: string | null;
  supersedesNumber: string | null;
  supersededById: string | null;
  supersededByNumber: string | null;
  supersededAt: string | null;
  correctionReason: string | null;
  returnChargeRate: number;
  cashHandlingRate: number;
  // The lines were charged at more than one set of rates (a new rate took
  // effect during the period); the header shows the rates at period end.
  ratesVary: boolean;
  deliveredCount: number;
  returnedCount: number;
  totalCod: number;
  codAlreadyRemitted: number;
  serviceCharges: number;
  returnCharges: number;
  cashHandlingBase: number;
  cashHandlingFee: number;
  paymentsReceived: number;
  codUnverified: number;
  codUncollected: number;
  feesUnverified: number;
  lines: StatementLine[];
  // Money that has changed hands for this statement (and any it corrected).
  // Not part of the statement's snapshot: it grows as payments are made.
  settlements: Settlement[];
  balance: StatementBalance;
};

export const SETTLEMENT_METHODS = ['bank_transfer', 'cash', 'cheque', 'card', 'other'] as const;
export type SettlementMethod = (typeof SETTLEMENT_METHODS)[number];

export type Settlement = {
  id: string;
  // The statement it was recorded against (an earlier version, after a correction).
  statementId: string;
  statementNumber: string | null;
  direction: 'to_merchant' | 'from_merchant';
  amount: number;
  method: SettlementMethod;
  reference: string | null;
  notes: string | null;
  paidOn: string;
  status: 'recorded' | 'void';
  voidReason: string | null;
  createdAt: string;
};

export type StatementBalance = {
  paidToMerchant: number;
  paidByMerchant: number;
  // > 0: ParcelLink still owes the merchant. < 0: the merchant still owes ParcelLink.
  balance: number;
  status: 'open' | 'partially_settled' | 'settled';
};

export const balanceLabel = (balance: StatementBalance) =>
  balance.balance > 0 ? ('owedToMerchant' as const) : balance.balance < 0 ? ('owedByMerchant' as const) : ('settled' as const);

// "STM-2026-000123"; only published statements have one.
const STATEMENT_NUMBER = /^STM-\d{4}-\d{6,}$/;
export const isStatementNumber = (value: unknown): value is string => typeof value === 'string' && STATEMENT_NUMBER.test(value);

// ── The arrangement shared by every view ─────────────────────────────────

export type SummaryRowKey =
  | 'totalCod'
  | 'codAlreadyRemitted'
  | 'serviceCharges'
  | 'serviceChargesPaid'
  | 'serviceChargesDue'
  | 'returnCharges'
  | 'cashHandlingFee'
  | 'paymentsReceived';

// "info" reports a settled charge without changing the remittance total.
export type SummaryRow = { key: SummaryRowKey; amount: number; sign: '' | '+' | '-' | 'info' };

export type StatementTotal = {
  // Which heading the final figure takes.
  label: 'netRemittance' | 'amountDue' | 'creditDue' | 'settled';
  // Always shown as a positive figure under its heading.
  amount: number;
  words: string;
};

type SummaryInput = Pick<
  Statement,
  | 'kind'
  | 'outcome'
  | 'accountingVersion'
  | 'netAmount'
  | 'totalCod'
  | 'codAlreadyRemitted'
  | 'serviceCharges'
  | 'returnCharges'
  | 'cashHandlingFee'
  | 'paymentsReceived'
>;

// COD statement: start from the cash collected for the merchant and deduct
// what ParcelLink is owed. Service statement: start from the charges and
// deduct what has been paid. Rows that are zero and don't belong to the
// scenario are left out, so a statement with no COD never shows a COD line.
export const statementSummary = (s: SummaryInput): SummaryRow[] => {
  if (s.kind === 'cod_remittance') {
    const rows: SummaryRow[] = [{ key: 'totalCod', amount: s.totalCod, sign: '' }];
    if (s.codAlreadyRemitted > 0) rows.push({ key: 'codAlreadyRemitted', amount: s.codAlreadyRemitted, sign: '-' });
    if (s.accountingVersion === 2) {
      const serviceCents = Math.round(s.serviceCharges * 100);
      const paidCents = Math.min(serviceCents, Math.round(s.paymentsReceived * 100));
      const dueCents = Math.max(serviceCents - paidCents, 0);
      if (paidCents > 0) rows.push({ key: 'serviceChargesPaid', amount: paidCents / 100, sign: 'info' });
      if (dueCents > 0) rows.push({ key: 'serviceChargesDue', amount: dueCents / 100, sign: '-' });
      if (s.returnCharges > 0) rows.push({ key: 'returnCharges', amount: s.returnCharges, sign: '-' });
      if (s.cashHandlingFee > 0) rows.push({ key: 'cashHandlingFee', amount: s.cashHandlingFee, sign: '-' });
      return rows;
    }
    rows.push({ key: 'serviceCharges', amount: s.serviceCharges, sign: '-' });
    rows.push({ key: 'returnCharges', amount: s.returnCharges, sign: '-' });
    // Removed by migration 0051; only statements issued before it carry one.
    if (s.cashHandlingFee > 0) rows.push({ key: 'cashHandlingFee', amount: s.cashHandlingFee, sign: '-' });
    if (s.paymentsReceived > 0) rows.push({ key: 'paymentsReceived', amount: s.paymentsReceived, sign: '+' });
    return rows;
  }
  const rows: SummaryRow[] = [{ key: 'serviceCharges', amount: s.serviceCharges, sign: '' }];
  rows.push({ key: 'returnCharges', amount: s.returnCharges, sign: '+' });
  if (s.paymentsReceived > 0) rows.push({ key: 'paymentsReceived', amount: s.paymentsReceived, sign: '-' });
  return rows;
};

export const statementTotal = (s: SummaryInput): StatementTotal => {
  const amount = Math.abs(s.netAmount);
  const label =
    s.outcome === 'settled'
      ? 'settled'
      : s.outcome === 'due_from_merchant'
        ? 'amountDue'
        : s.kind === 'cod_remittance'
          ? 'netRemittance'
          : // No COD, but payments exceed the charges: a credit, not a remittance.
            'creditDue';
  return { label, amount, words: amountInWords(amount.toFixed(2)) };
};

// The summary rows must add up to the stored net figure; if they ever
// didn't, the statement would be showing something it doesn't hold.
export const summaryMatchesNet = (s: SummaryInput): boolean => {
  const cents = (value: number) => Math.round(value * 100);
  if (s.kind === 'cod_remittance' && s.accountingVersion === 2) {
    const service = cents(s.serviceCharges);
    const paid = Math.min(service, cents(s.paymentsReceived));
    return cents(s.totalCod) - cents(s.codAlreadyRemitted) - Math.max(service - paid, 0) - cents(s.returnCharges) - cents(s.cashHandlingFee) === cents(s.netAmount);
  }
  const sumCod =
    cents(s.totalCod) - cents(s.codAlreadyRemitted) - cents(s.serviceCharges) - cents(s.returnCharges) - cents(s.cashHandlingFee) + cents(s.paymentsReceived);
  return sumCod === cents(s.netAmount);
};
