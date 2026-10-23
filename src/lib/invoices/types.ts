import type { DeliveryType, PackageType, PaymentMethod } from '@/lib/types';

// Invoices (migration 0031). Every value here is the snapshot taken when
// the invoice was issued — never re-read from the shipments.

export const INVOICE_TYPES = ['individual_shipment', 'merchant_shipment', 'bulk_shipment'] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export type InvoiceStatus = 'issued' | 'void';

// INV-2026-000123 (next_invoice_number(), migration 0031). Checked before
// any lookup so a hand-edited URL never reaches the database as-is.
const INVOICE_NUMBER = /^INV-\d{4}-\d{6,}$/;
export const isInvoiceNumber = (value: unknown): value is string => typeof value === 'string' && INVOICE_NUMBER.test(value);

export type BilledTo = {
  name: string;
  email?: string;
  phone?: string;
  // Merchants: the company's contact and registration details.
  contactPerson?: string;
  address?: string;
  city?: string;
  country?: string;
  trn?: string;
  registrationNumber?: string;
  licenseNumber?: string;
  accountHolder?: string;
  // A guest booking: a customer with no ParcelLink account, booked by
  // staff (migrations 0040, 0054).
  walkIn?: boolean;
};

export type InvoiceLine = {
  lineNumber: number;
  trackingNumber: string;
  bookedAt: string;
  pickupAddress: string;
  dropoffAddress: string;
  recipientName: string;
  deliveryType: DeliveryType | null;
  packageType: PackageType;
  description: string;
  quantity: number;
  weightKg: number | null;
  distanceKm: number;
  paymentMethod: PaymentMethod;
  baseCharge: number | null;
  distanceCharge: number | null;
  serviceCharge: number;
  weightCharge: number;
  codCharge: number;
  amount: number;
  currency: string;
  // Cash the driver collects from the recipient for the goods, on the
  // sender's behalf — not a ParcelLink charge and not in `amount`. Null on
  // invoices issued before migration 0054.
  codAmount: number | null;
};

export type Invoice = {
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  billedTo: BilledTo;
  // Tracking number, or the bulk shipment's reference.
  reference: string;
  batchName: string | null;
  pickupAddress: string | null;
  shipmentCount: number;
  subtotal: number;
  additionalCharges: number;
  discountTotal: number;
  total: number;
  currency: string;
  issuedAt: string;
  voidedAt: string | null;
  // Where the invoiced shipment or bulk shipment can be opened.
  shipmentId: string | null;
  batchId: string | null;
  lines: InvoiceLine[];
};

// What the payment records say now about a single-shipment invoice
// (invoice_payment_state(), migration 0054) — read live, never part of the
// issued invoice.
export const INVOICE_PAYMENT_STATES = ['paid', 'refunded', 'billed_to_account', 'cash_collected', 'cancelled', 'unpaid'] as const;
export type InvoicePaymentState = (typeof INVOICE_PAYMENT_STATES)[number];

export type InvoicePayment = {
  state: InvoicePaymentState;
  amountDue: number;
  currency: string;
  checkedAt: string;
};

// The COD the drivers collect for the sender on this invoice's shipments,
// when the invoice recorded it (0054) and there is any. A memo only: never
// part of the invoice's amounts.
export const codMemo = (invoice: Pick<Invoice, 'lines'>): number | null => {
  const recorded = invoice.lines.filter((line) => line.codAmount !== null);
  if (recorded.length === 0) return null;
  const fils = recorded.reduce((sum, line) => sum + Math.round(line.codAmount! * 100), 0);
  return fils > 0 ? fils / 100 : null;
};
