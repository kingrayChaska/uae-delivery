import { jsPDF } from 'jspdf';

import { COMPANY } from '@/lib/brand';
import { drawable, drawText, fitText, registerFonts, wrapText } from '@/lib/finance/pdf-text';
import invoicesAr from '../../../messages/ar/invoices.json';
import invoicesEn from '../../../messages/en/invoices.json';
import shipmentsAr from '../../../messages/ar/shipments.json';
import shipmentsEn from '../../../messages/en/shipments.json';

import type { Locale } from '@/i18n/config';
import { codMemo } from '@/lib/invoices/types';

import type { Invoice, InvoiceLine, InvoicePayment } from '@/lib/invoices/types';

// The downloadable PDF of an invoice, drawn on the server from the
// invoice's stored snapshot (migration 0031) — the same figures, rows and
// wording as the on-screen invoice (components/invoices/invoice-document),
// in the reader's language. It does no arithmetic beyond what the screen
// does (the price-adjustment line, and codMemo()). The payment status, when given, is the live one from
// invoice_payment_state() and is labelled as such.

const MESSAGES = {
  en: { inv: invoicesEn, shipments: shipmentsEn },
  ar: { inv: invoicesAr, shipments: shipmentsAr },
} as const;

const INTL: Record<Locale, string> = { en: 'en-GB', ar: 'ar-AE-u-nu-latn' };

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));

// Western digits with a comma separator, as on screen, in both languages.
const amount = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const money = (value: number, currency: string) => `${currency} ${amount(value)}`;
const fils = (value: number) => Math.round(value * 100);

// The charge rows of a single-shipment invoice — as ShipmentCharges shows them.
export const chargeRows = (line: InvoiceLine, labels: typeof invoicesEn.charges): [string, number][] => {
  const rows: [string, number][] =
    line.baseCharge !== null && line.distanceCharge !== null
      ? [
          [labels.base, line.baseCharge],
          [labels.distance, line.distanceCharge],
        ]
      : [[labels.service, line.serviceCharge]];
  if (line.baseCharge !== null && line.distanceCharge !== null) {
    const adjustment = fils(line.serviceCharge) - fils(line.baseCharge) - fils(line.distanceCharge);
    if (adjustment !== 0) rows.push([labels.adjustment, adjustment / 100]);
  }
  if (line.weightCharge > 0) rows.push([labels.weight, line.weightCharge]);
  if (line.codCharge > 0) rows.push([labels.cod, line.codCharge]);
  return rows;
};

export type InvoicePdfModel = {
  direction: 'ltr' | 'rtl';
  title: string;
  kind: string;
  number: string;
  meta: [string, string][];
  notices: string[];
  billedHeading: string;
  billedTo: string[];
  detailsHeading: string;
  details: [string, string][];
  table: { heading: string; columns: { label: string; numeric: boolean; width: number }[]; rows: string[][] };
  totals: { label: string; value: string; strong?: boolean }[];
  currencyNote: string;
  cod: { heading: string; text: string } | null;
  payment: { heading: string; state: string; due: string | null; note: string } | null;
  footer: string[];
  pageLabel: string;
};

export const invoicePdfModel = (invoice: Invoice, payment: InvoicePayment | null, locale: Locale = 'en'): InvoicePdfModel => {
  const { inv, shipments } = MESSAGES[locale];
  const intl = INTL[locale];
  const date = (iso: string) => new Intl.DateTimeFormat(intl, { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat(intl, { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const service = (type: InvoiceLine['deliveryType']) => (type ? shipments.deliveryType[type].label : '-');
  const currency = invoice.currency;
  const isBulk = invoice.type === 'bulk_shipment';
  const [line] = invoice.lines;

  let unsupported = false;
  const text = (value: string) => {
    const result = drawable(value);
    unsupported ||= result.replaced;
    return result.text;
  };

  const b = invoice.billedTo;
  const place = [b.address, b.city, b.country].filter(Boolean).join(', ');
  const billedTo = [
    text(b.name),
    ...(b.walkIn ? [inv.walkIn] : []),
    ...(b.contactPerson && b.contactPerson !== b.name ? [text(fill(inv.contactPerson, { name: b.contactPerson }))] : []),
    ...(place ? [text(place)] : []),
    ...(b.email ? [text(b.email)] : []),
    ...(b.phone ? [text(b.phone)] : []),
    ...(b.trn ? [text(fill(inv.trn, { trn: b.trn }))] : []),
    ...(b.registrationNumber ? [text(fill(inv.registration, { number: b.registrationNumber }))] : []),
    ...(b.licenseNumber ? [text(fill(inv.license, { number: b.licenseNumber }))] : []),
    ...(b.accountHolder && b.accountHolder !== b.name && b.accountHolder !== b.contactPerson ? [text(fill(inv.accountHolder, { name: b.accountHolder }))] : []),
  ];

  let details: [string, string][];
  let table: InvoicePdfModel['table'];
  if (isBulk) {
    const booked = invoice.lines.map((l) => l.bookedAt).sort();
    details = [
      [inv.bulk.reference, invoice.reference],
      ...(invoice.batchName ? ([[inv.bulk.name, text(invoice.batchName)]] as [string, string][]) : []),
      [inv.bulk.shipments, String(invoice.shipmentCount)],
      ...(booked.length ? ([[inv.bulk.period, date(booked[0]) === date(booked[booked.length - 1]) ? date(booked[0]) : `${date(booked[0])} - ${date(booked[booked.length - 1])}`]] as [string, string][]) : []),
      ...(invoice.pickupAddress ? ([[inv.bulk.pickup, text(invoice.pickupAddress)]] as [string, string][]) : []),
    ];
    table = {
      heading: inv.bulk.lines,
      columns: [
        { label: inv.bulk.col.line, numeric: false, width: 8 },
        { label: inv.bulk.col.tracking, numeric: false, width: 26 },
        { label: inv.bulk.col.booked, numeric: false, width: 22 },
        { label: inv.bulk.col.deliverTo, numeric: false, width: 64 },
        { label: inv.bulk.col.service, numeric: false, width: 26 },
        { label: inv.bulk.col.amount, numeric: true, width: 24 },
      ],
      rows: invoice.lines.map((l) => [
        String(l.lineNumber),
        l.trackingNumber,
        date(l.bookedAt),
        text(`${l.recipientName} · ${l.dropoffAddress}`),
        service(l.deliveryType),
        amount(l.amount),
      ]),
    };
  } else {
    details = line
      ? [
          [inv.shipment.tracking, line.trackingNumber],
          [inv.shipment.booked, dateTime(line.bookedAt)],
          [inv.shipment.pickup, text(line.pickupAddress)],
          [inv.shipment.delivery, text(line.dropoffAddress)],
          [inv.shipment.recipient, text(line.recipientName)],
          [inv.shipment.deliveryType, service(line.deliveryType)],
          [inv.shipment.parcelType, shipments.packageType[line.packageType]],
          [inv.shipment.contents, line.description ? text(line.description) : '-'],
          [inv.shipment.quantity, String(line.quantity)],
          [inv.shipment.weight, line.weightKg !== null ? `${line.weightKg} kg` : '-'],
          [inv.shipment.distance, `${line.distanceKm} km`],
          [inv.shipment.payment, shipments.paymentMethod[line.paymentMethod]],
        ]
      : [];
    table = {
      heading: inv.charges.heading,
      columns: [
        { label: inv.charges.description, numeric: false, width: 140 },
        { label: inv.charges.amount, numeric: true, width: 40 },
      ],
      rows: line ? chargeRows(line, inv.charges).map(([label, value]) => [label, money(value, line.currency)]) : [],
    };
  }

  const totals: InvoicePdfModel['totals'] = [
    { label: inv.totals.subtotal, value: money(invoice.subtotal, currency) },
    ...(invoice.additionalCharges > 0 ? [{ label: inv.totals.additional, value: money(invoice.additionalCharges, currency) }] : []),
    ...(invoice.discountTotal > 0 ? [{ label: inv.totals.discount, value: `- ${money(invoice.discountTotal, currency)}` }] : []),
    { label: inv.totals.total, value: money(invoice.total, currency), strong: true },
  ];

  const cod = codMemo(invoice);
  const notices: string[] = [];
  if (invoice.status === 'void' && invoice.voidedAt) notices.push(fill(inv.voidNotice, { date: date(invoice.voidedAt) }));
  const footer = [inv.footer, fill(inv.questions, { email: COMPANY.email, phone: COMPANY.phone })];
  if (unsupported) footer.unshift(inv.pdf.characters);

  return {
    direction: locale === 'ar' ? 'rtl' : 'ltr',
    title: locale === 'en' ? inv.title.toUpperCase() : inv.title,
    kind: inv.types[invoice.type],
    number: invoice.invoiceNumber,
    meta: [
      [inv.number, invoice.invoiceNumber],
      [inv.issued, date(invoice.issuedAt)],
      ...(invoice.status === 'void' ? ([[inv.voidBadge, invoice.voidedAt ? date(invoice.voidedAt) : '-']] as [string, string][]) : []),
    ],
    notices,
    billedHeading: inv.billedTo,
    billedTo,
    detailsHeading: isBulk ? inv.bulk.heading : inv.shipment.heading,
    details,
    table,
    totals,
    currencyNote: fill(inv.totals.currency, { currency }),
    cod: cod !== null ? { heading: inv.cod.heading, text: fill(isBulk ? inv.cod.bulk : inv.cod.single, { amount: money(cod, currency) }) } : null,
    payment: payment
      ? {
          heading: inv.payment.heading,
          state: inv.payment.states[payment.state],
          due: payment.state === 'unpaid' || payment.state === 'paid' || payment.state === 'cash_collected'
            ? `${inv.payment.amountDue}: ${money(payment.amountDue, payment.currency)}`
            : null,
          note: fill(inv.payment.asOf, { date: dateTime(payment.checkedAt) }),
        }
      : null,
    footer,
    pageLabel: inv.pdf.page,
  };
};

// ── Drawing ──────────────────────────────────────────────────────────────

const PAGE = { width: 210, height: 297 };
const MARGIN = 16;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

export const renderInvoicePdf = (invoice: Invoice, payment: InvoicePayment | null, locale: Locale = 'en'): ArrayBuffer => {
  const model = invoicePdfModel(invoice, payment, locale);
  const rtl = model.direction === 'rtl';
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  registerFonts(pdf);
  pdf.setProperties({ title: `${model.title} ${model.number}`, subject: model.kind, author: COMPANY.name, creator: COMPANY.name });
  pdf.setLanguage(rtl ? 'ar' : 'en-GB');

  // Written left to right; for Arabic every position is mirrored.
  const X = (x: number) => (rtl ? PAGE.width - x : x);
  const start = rtl ? 'right' : 'left';
  const end = rtl ? 'left' : 'right';
  const RIGHT = PAGE.width - MARGIN;

  let y = MARGIN;
  const ensure = (height: number, onNewPage?: () => void) => {
    if (y + height > PAGE.height - MARGIN - 6) {
      pdf.addPage();
      y = MARGIN;
      onNewPage?.();
    }
  };
  type Style = { size?: number; bold?: boolean; color?: number };
  const write = (value: string, at: number, align: 'start' | 'end', style: Style = {}) =>
    drawText(pdf, value, X(at), y, { size: style.size ?? 9, bold: style.bold, color: style.color, align: align === 'start' ? start : end });
  const rule = (from: number, to: number, width: number, gray: number) => {
    pdf.setLineWidth(width);
    pdf.setDrawColor(gray);
    pdf.line(X(from), y, X(to), y);
  };
  const paragraph = (value: string, size = 8, color = 70, width = CONTENT_WIDTH, at = MARGIN) => {
    for (const line of wrapText(pdf, value, width, { size })) {
      ensure(4.5);
      write(line, at, 'start', { size, color });
      y += size * 0.5;
    }
  };

  // Header
  y += 4;
  write(COMPANY.name, MARGIN, 'start', { size: 14, bold: true });
  write(model.title, RIGHT, 'end', { size: 18, bold: true });
  y += 6;
  write(`${COMPANY.email} · ${COMPANY.phone} · ${COMPANY.website}`, MARGIN, 'start', { size: 8, color: 90 });
  write(model.kind, RIGHT, 'end', { size: 9, color: 90 });
  y += 6;
  for (const [label, value] of model.meta) {
    write(label, RIGHT - 70, 'start', { size: 8, color: 110 });
    write(value, RIGHT, 'end', { size: 8.5, bold: true });
    y += 4.5;
  }
  y += 1;
  rule(MARGIN, RIGHT, 0.6, 20);
  y += 7;

  for (const notice of model.notices) paragraph(notice, 9, 150);
  if (model.notices.length) y += 2;

  // Billed to
  write(model.billedHeading.toUpperCase(), MARGIN, 'start', { size: 7.5, bold: true, color: 110 });
  y += 5;
  model.billedTo.forEach((line, index) => {
    ensure(5);
    write(fitText(pdf, line, CONTENT_WIDTH, { size: index === 0 ? 11 : 8.5, bold: index === 0 }), MARGIN, 'start', { size: index === 0 ? 11 : 8.5, bold: index === 0 });
    y += index === 0 ? 5.5 : 4.2;
  });
  y += 4;

  // Shipment / bulk details, label beside value
  ensure(10);
  write(model.detailsHeading, MARGIN, 'start', { size: 9, bold: true });
  y += 5.5;
  const labelWidth = 38;
  for (const [label, value] of model.details) {
    const lines = wrapText(pdf, value, CONTENT_WIDTH - labelWidth, { size: 8.5 });
    ensure(lines.length * 4.2 + 1);
    write(label, MARGIN, 'start', { size: 8, color: 110 });
    lines.forEach((line, index) => {
      write(line, MARGIN + labelWidth, 'start', { size: 8.5 });
      if (index < lines.length - 1) y += 4;
    });
    y += 4.8;
  }
  y += 4;

  // Charges / lines
  const scale = CONTENT_WIDTH / model.table.columns.reduce((sum, column) => sum + column.width, 0);
  const lefts: number[] = [];
  model.table.columns.reduce((x, column) => {
    lefts.push(x);
    return x + column.width * scale;
  }, MARGIN);
  const drawRow = (cells: string[], style: Style = {}) => {
    cells.forEach((cell, index) => {
      const column = model.table.columns[index];
      const size = style.size ?? 8;
      const fitted = fitText(pdf, cell, column.width * scale - 2, { size, bold: style.bold });
      if (column.numeric) write(fitted, lefts[index] + column.width * scale - 1, 'end', { ...style, size });
      else write(fitted, lefts[index], 'start', { ...style, size });
    });
  };
  const header = () => {
    drawRow(model.table.columns.map((c) => (rtl ? c.label : c.label.toUpperCase())), { bold: true, size: 6.5, color: 100 });
    y += 1.5;
    rule(MARGIN, RIGHT, 0.3, 150);
    y += 4;
  };
  ensure(14);
  write(model.table.heading, MARGIN, 'start', { size: 9, bold: true });
  y += 5;
  header();
  for (const row of model.table.rows) {
    ensure(5, header);
    drawRow(row);
    y += 1.5;
    rule(MARGIN, RIGHT, 0.1, 210);
    y += 3.5;
  }
  y += 3;

  // Totals, at the end side
  const blockStart = RIGHT - 80;
  ensure(8 + model.totals.length * 6);
  for (const row of model.totals) {
    if (row.strong) {
      y -= 1.5;
      rule(blockStart, RIGHT, 0.6, 20);
      y += 5;
    }
    const style = { size: row.strong ? 11 : 9, bold: row.strong };
    write(row.label, blockStart, 'start', style);
    write(row.value, RIGHT, 'end', style);
    y += row.strong ? 6 : 5.5;
  }
  write(model.currencyNote, RIGHT, 'end', { size: 7.5, color: 110 });
  y += 8;

  // COD memo: shown apart, never in the totals
  if (model.cod) {
    ensure(14);
    write(model.cod.heading, MARGIN, 'start', { size: 9, bold: true });
    y += 5;
    paragraph(model.cod.text, 8.5, 50);
    y += 4;
  }

  // Live payment status
  if (model.payment) {
    ensure(18);
    write(model.payment.heading, MARGIN, 'start', { size: 9, bold: true });
    y += 5;
    write(model.payment.state, MARGIN, 'start', { size: 10, bold: true });
    if (model.payment.due) write(model.payment.due, RIGHT, 'end', { size: 10, bold: true });
    y += 5;
    paragraph(model.payment.note, 7.5, 100);
    y += 4;
  }

  // Footer
  ensure(10);
  y += 2;
  rule(MARGIN, RIGHT, 0.3, 170);
  y += 5;
  for (const line of model.footer) paragraph(line, 7.5, 90);

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    y = PAGE.height - 8;
    write(`${model.number} · ${fill(model.pageLabel, { page, pages })}`, RIGHT, 'end', { size: 7, color: 130 });
  }

  return pdf.output('arraybuffer');
};
