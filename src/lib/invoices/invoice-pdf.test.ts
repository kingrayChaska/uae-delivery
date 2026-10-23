import { describe, expect, it, vi } from 'vitest';

import { guestInvoice, invoiceLine } from '@/lib/invoices/fixtures.test-helpers';
import { invoicePdfModel, renderInvoicePdf } from '@/lib/invoices/invoice-pdf';
import { codMemo } from '@/lib/invoices/types';

import type { InvoicePayment } from '@/lib/invoices/types';

// The invoice PDF (and the on-screen invoice, which shares codMemo and the
// charge rows) is a reading of the stored snapshot: these tests check it
// shows the right customer, charges and totals, keeps COD apart from
// ParcelLink's charges, and only calls an invoice paid when the payment
// records say so.

const drawCalls = vi.hoisted(() => [] as string[]);
vi.mock('jspdf', async (importOriginal) => {
  const mod = await importOriginal<typeof import('jspdf')>();
  class RecordingPdf extends mod.jsPDF {
    constructor(...args: ConstructorParameters<typeof mod.jsPDF>) {
      super(...args);
      const text = this.text.bind(this);
      this.text = ((...textArgs: Parameters<typeof text>) => {
        drawCalls.push(String(textArgs[0]));
        return text(...textArgs);
      }) as typeof text;
    }
  }
  return { ...mod, jsPDF: RecordingPdf };
});

const payment = (state: InvoicePayment['state'], amountDue = 0): InvoicePayment => ({ state, amountDue, currency: 'AED', checkedAt: '2026-10-22T10:00:00Z' });

describe('invoicePdfModel', () => {
  it('bills a walk-in customer by name and phone, without an account', () => {
    const model = invoicePdfModel(guestInvoice(), null);
    expect(model.billedTo).toEqual(['Omar Haddad', 'Walk-in customer · no ParcelLink account', '+971 50 123 4567']);
    expect(model.kind).toBe('Shipment invoice');
    expect(model.meta).toEqual([
      ['Invoice number', 'INV-2026-000042'],
      ['Invoice date', '21 Oct 2026'],
    ]);
  });

  it('copes with a guest who gave only a name', () => {
    const model = invoicePdfModel(guestInvoice({ billedTo: { name: 'Walk-in', walkIn: true } }), null);
    expect(model.billedTo).toEqual(['Walk-in', 'Walk-in customer · no ParcelLink account']);
  });

  it('shows the stored charges and totals — nothing recalculated', () => {
    const model = invoicePdfModel(guestInvoice(), null);
    expect(model.table.rows).toEqual([
      ['Base delivery charge', 'AED 20.00'],
      ['Distance charge', 'AED 5.00'],
    ]);
    expect(model.totals).toEqual([
      { label: 'Subtotal', value: 'AED 25.00' },
      { label: 'Total', value: 'AED 25.00', strong: true },
    ]);
  });

  it('keeps COD out of the charges and totals, and says so', () => {
    const invoice = guestInvoice({ lines: [invoiceLine({ codAmount: 350 })] });
    const model = invoicePdfModel(invoice, null);
    expect(model.totals.at(-1)).toEqual({ label: 'Total', value: 'AED 25.00', strong: true });
    expect(model.table.rows.flat().join(' ')).not.toContain('350');
    expect(model.cod?.text).toContain('AED 350.00');
    expect(model.cod?.text).toContain('not a ParcelLink charge');
  });

  it('has no COD memo when there is no COD, or the invoice predates recording it', () => {
    expect(invoicePdfModel(guestInvoice(), null).cod).toBeNull();
    expect(codMemo(guestInvoice({ lines: [invoiceLine({ codAmount: null })] }))).toBeNull();
  });

  it('sums a bulk invoice’s COD in fils', () => {
    const lines = [invoiceLine({ codAmount: 0.1 }), invoiceLine({ lineNumber: 2, codAmount: 0.2 }), invoiceLine({ lineNumber: 3, codAmount: null })];
    expect(codMemo({ lines })).toBe(0.3);
  });

  it('only says paid when the payment records do', () => {
    expect(invoicePdfModel(guestInvoice(), null).payment).toBeNull();
    expect(invoicePdfModel(guestInvoice(), payment('unpaid', 25)).payment).toMatchObject({ state: 'Not yet paid', due: 'Amount due: AED 25.00' });
    expect(invoicePdfModel(guestInvoice(), payment('paid')).payment).toMatchObject({ state: 'Paid', due: 'Amount due: AED 0.00' });
    expect(invoicePdfModel(guestInvoice(), payment('cash_collected')).payment?.state).toBe('Delivery fee collected in cash by the driver');
    expect(invoicePdfModel(guestInvoice(), payment('billed_to_account')).payment).toMatchObject({ due: null });
  });

  it('shows a price changed by operations as its own line', () => {
    const model = invoicePdfModel(guestInvoice({ lines: [invoiceLine({ serviceCharge: 30, amount: 30 })], subtotal: 30, total: 30 }), null);
    expect(model.table.rows).toContainEqual(['Price adjustment', 'AED 5.00']);
  });

  it('marks a void invoice', () => {
    const model = invoicePdfModel(guestInvoice({ status: 'void', voidedAt: '2026-10-22T08:00:00Z' }), null);
    expect(model.notices[0]).toContain('voided on 22 Oct 2026');
  });
});

describe('renderInvoicePdf', () => {
  it('draws a PDF with the customer, the figures and the live payment status', () => {
    drawCalls.length = 0;
    const output = Buffer.from(renderInvoicePdf(guestInvoice({ lines: [invoiceLine({ codAmount: 350 })] }), payment('unpaid', 25))).toString('latin1');
    expect(output.startsWith('%PDF-')).toBe(true);
    expect(drawCalls).toEqual(expect.arrayContaining(['Omar Haddad', 'Walk-in customer · no ParcelLink account', 'AED 25.00', 'INV-2026-000042', 'Not yet paid']));
    expect(drawCalls).toContain('Amount due: AED 25.00');
    // COD is drawn in its own memo, never as a charge row or a total.
    expect(drawCalls.some((text) => text.includes('AED 350.00') && text.includes('collects'))).toBe(true);
    expect(drawCalls).not.toContain('AED 375.00');
  });

  it('is drawn in Arabic for an Arabic reader', () => {
    const output = Buffer.from(renderInvoicePdf(guestInvoice(), null, 'ar')).toString('latin1');
    expect(output).toContain('/Lang (ar)');
  });
});
