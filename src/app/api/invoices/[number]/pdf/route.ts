import { NextResponse } from 'next/server';

import { getCurrentProfile } from '@/lib/auth/session';
import { getRequestLocale } from '@/i18n/request';
import { renderInvoicePdf } from '@/lib/invoices/invoice-pdf';
import { isInvoiceNumber } from '@/lib/invoices/types';
import { getInvoiceByNumber, getInvoicePayment } from '@/services/invoices/get-invoice';

import type { NextRequest } from 'next/server';

// The PDF of one invoice. It is read with the caller's own session, so RLS
// (invoices_select, migration 0031) decides access exactly as for the
// invoice page: the customer, members of the business billed, and staff
// (operators and managers, who see every shipment — including guest
// bookings, which have no customer account). Anyone else, a guessed number
// or another role is a 404, so the endpoint doesn't reveal which invoices
// exist. Nothing is stored or issued here: the PDF is drawn from the
// immutable snapshot on each request, so downloading it again never
// creates a charge or an invoice.
const ROLES = ['customer', 'operator', 'manager'];

export const GET = async (_request: NextRequest, { params }: { params: Promise<{ number: string }> }) => {
  const profile = await getCurrentProfile();
  const { number } = await params;
  if (!profile || !profile.active || !ROLES.includes(profile.role) || !isInvoiceNumber(number)) {
    return new NextResponse('Not found', { status: 404 });
  }

  let invoice;
  try {
    invoice = await getInvoiceByNumber(number);
  } catch (error) {
    console.error('Invoice PDF: invoice could not be read', error instanceof Error ? error.message : error);
    return new NextResponse('Something went wrong', { status: 500 });
  }
  if (!invoice) return new NextResponse('Not found', { status: 404 });

  const payment = await getInvoicePayment(number);
  const pdf = renderInvoicePdf(invoice, payment, await getRequestLocale());

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
