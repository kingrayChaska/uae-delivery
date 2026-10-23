import type { Invoice, InvoiceLine } from '@/lib/invoices/types';

// Invoices as getInvoiceByNumber() returns them, for tests.

export const invoiceLine = (change: Partial<InvoiceLine> = {}): InvoiceLine => ({
  lineNumber: 1,
  trackingNumber: 'PL-ABC123',
  bookedAt: '2026-10-20T08:30:00Z',
  pickupAddress: 'Al Barsha 1, Dubai',
  dropoffAddress: 'Al Nahda 2, Sharjah',
  recipientName: 'Sara Khan',
  deliveryType: 'same_day',
  packageType: 'parcel',
  description: 'Shoes',
  quantity: 1,
  weightKg: 2,
  distanceKm: 18.4,
  paymentMethod: 'cod',
  baseCharge: 20,
  distanceCharge: 5,
  serviceCharge: 25,
  weightCharge: 0,
  codCharge: 0,
  amount: 25,
  currency: 'AED',
  codAmount: 0,
  ...change,
});

// A walk-in (WhatsApp / telephone) customer's shipment, invoiced by staff (0054).
export const guestInvoice = (change: Partial<Invoice> = {}): Invoice => ({
  invoiceNumber: 'INV-2026-000042',
  type: 'individual_shipment',
  status: 'issued',
  billedTo: { name: 'Omar Haddad', phone: '+971 50 123 4567', walkIn: true },
  reference: 'PL-ABC123',
  batchName: null,
  pickupAddress: null,
  shipmentCount: 1,
  subtotal: 25,
  additionalCharges: 0,
  discountTotal: 0,
  total: 25,
  currency: 'AED',
  issuedAt: '2026-10-21T09:00:00Z',
  voidedAt: null,
  shipmentId: '22222222-2222-4222-8222-222222222222',
  batchId: null,
  lines: [invoiceLine()],
  ...change,
});
