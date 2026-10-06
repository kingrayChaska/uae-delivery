import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/security/validate';
import { isInvoiceNumber } from '@/lib/invoices/types';

import type { BilledTo, Invoice, InvoiceLine, InvoiceStatus, InvoiceType } from '@/lib/invoices/types';
import type { DeliveryType, PackageType, PaymentMethod } from '@/lib/types';

// Every read here uses the caller's own session: invoices_select (migration
// 0031) lets the customer, members of the business account it was billed
// to, and staff see an invoice — anyone else gets nothing, as if it didn't
// exist. Nothing here decides access itself.

type Numeric = number | string;

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_type: InvoiceType;
  status: InvoiceStatus;
  billed_to: BilledTo;
  reference: string;
  batch_name: string | null;
  pickup_address: string | null;
  shipment_count: number;
  subtotal: Numeric;
  additional_charges: Numeric;
  discount_total: Numeric;
  total: Numeric;
  currency: string;
  issued_at: string;
  voided_at: string | null;
  shipment_id: string | null;
  batch_id: string | null;
};

type LineRow = {
  line_number: number;
  tracking_number: string;
  booked_at: string;
  pickup_address: string;
  dropoff_address: string;
  recipient_name: string;
  delivery_type: DeliveryType | null;
  package_type: PackageType;
  description: string;
  quantity: number;
  weight_kg: Numeric | null;
  distance_km: Numeric;
  payment_method: PaymentMethod;
  base_charge: Numeric | null;
  distance_charge: Numeric | null;
  service_charge: Numeric;
  weight_charge: Numeric;
  cod_charge: Numeric;
  amount: Numeric;
  currency: string;
};

const INVOICE_SELECT =
  'id, invoice_number, invoice_type, status, billed_to, reference, batch_name, pickup_address, shipment_count, subtotal, additional_charges, discount_total, total, currency, issued_at, voided_at, shipment_id, batch_id';

const LINE_SELECT =
  'line_number, tracking_number, booked_at, pickup_address, dropoff_address, recipient_name, delivery_type, package_type, description, quantity, weight_kg, distance_km, payment_method, base_charge, distance_charge, service_charge, weight_charge, cod_charge, amount, currency';

// PostgREST returns at most 1,000 rows per request; a bulk invoice can hold
// more, so its lines are read a page at a time (one request per 1,000
// lines, never one per shipment).
const LINE_PAGE = 1000;

const num = (value: Numeric) => Number(value);
const numOrNull = (value: Numeric | null) => (value === null ? null : Number(value));

const toLine = (row: LineRow): InvoiceLine => ({
  lineNumber: row.line_number,
  trackingNumber: row.tracking_number,
  bookedAt: row.booked_at,
  pickupAddress: row.pickup_address,
  dropoffAddress: row.dropoff_address,
  recipientName: row.recipient_name,
  deliveryType: row.delivery_type,
  packageType: row.package_type,
  description: row.description,
  quantity: row.quantity,
  weightKg: numOrNull(row.weight_kg),
  distanceKm: num(row.distance_km),
  paymentMethod: row.payment_method,
  baseCharge: numOrNull(row.base_charge),
  distanceCharge: numOrNull(row.distance_charge),
  serviceCharge: num(row.service_charge),
  weightCharge: num(row.weight_charge),
  codCharge: num(row.cod_charge),
  amount: num(row.amount),
  currency: row.currency,
});

// The invoice and all of its lines, or null when there's no such invoice
// or the caller may not see it. Throws when the database can't be read.
export const getInvoiceByNumber = async (invoiceNumber: string): Promise<Invoice | null> => {
  if (!isInvoiceNumber(invoiceNumber)) return null;
  const supabase = await createClient();

  const { data, error } = await supabase.from('invoices').select(INVOICE_SELECT).eq('invoice_number', invoiceNumber).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as InvoiceRow;

  const lines: InvoiceLine[] = [];
  for (let from = 0; ; from += LINE_PAGE) {
    const { data: lineRows, error: lineError } = await supabase
      .from('invoice_line_items')
      .select(LINE_SELECT)
      .eq('invoice_id', row.id)
      .order('line_number', { ascending: true })
      .range(from, from + LINE_PAGE - 1);
    if (lineError) throw new Error(lineError.message);
    lines.push(...((lineRows ?? []) as LineRow[]).map(toLine));
    if (!lineRows || lineRows.length < LINE_PAGE) break;
  }

  return {
    invoiceNumber: row.invoice_number,
    type: row.invoice_type,
    status: row.status,
    billedTo: row.billed_to,
    reference: row.reference,
    batchName: row.batch_name,
    pickupAddress: row.pickup_address,
    shipmentCount: row.shipment_count,
    subtotal: num(row.subtotal),
    additionalCharges: num(row.additional_charges),
    discountTotal: num(row.discount_total),
    total: num(row.total),
    currency: row.currency,
    issuedAt: row.issued_at,
    voidedAt: row.voided_at,
    shipmentId: row.shipment_id,
    batchId: row.batch_id,
    lines,
  };
};

// The live invoice number for a shipment or a bulk shipment, if one has
// been issued (and the caller may see it). One indexed lookup.
export const getInvoiceNumberFor = async ({
  shipmentId,
  batchId,
}: {
  shipmentId?: string | null;
  batchId?: string | null;
}): Promise<string | null> => {
  const column = shipmentId ? 'shipment_id' : 'batch_id';
  const id = shipmentId ?? batchId;
  if (!id || !isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('invoices').select('invoice_number').eq(column, id).eq('status', 'issued').maybeSingle();
  if (error) {
    console.error('Invoice lookup failed', error.message);
    return null;
  }
  return data?.invoice_number ?? null;
};
