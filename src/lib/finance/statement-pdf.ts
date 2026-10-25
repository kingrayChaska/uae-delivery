import { jsPDF } from 'jspdf';

import { COMPANY } from '@/lib/brand';
import { drawable, drawText, fitText, registerFonts, wrapText } from '@/lib/finance/pdf-text';
import { balanceLabel, statementSummary, statementTotal } from '@/lib/finance/statements';
import financeAr from '../../../messages/ar/finance.json';
import financeEn from '../../../messages/en/finance.json';
import shipmentsAr from '../../../messages/ar/shipments.json';
import shipmentsEn from '../../../messages/en/shipments.json';

import type { Locale } from '@/i18n/config';
import type { Statement, SummaryRow } from '@/lib/finance/statements';

// The downloadable PDF of a merchant account statement, built on the server
// from the statement's stored snapshot, in the reader's language (English,
// or Arabic laid out right to left). It does no arithmetic of its own: the
// summary and the final figure come from statementSummary() and
// statementTotal() — exactly what the on-screen statement shows — and the
// wording from the same messages the portal uses. Text is drawn in IBM Plex
// Sans Arabic, which covers Arabic and Latin (lib/finance/pdf-text.ts).

const MESSAGES = {
  en: { doc: financeEn.document, shipments: shipmentsEn },
  ar: { doc: financeAr.document, shipments: shipmentsAr },
} as const;

const INTL: Record<Locale, string> = { en: 'en-GB', ar: 'ar-AE-u-nu-latn' };

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);

// Figures are always Western digits with a comma thousands separator, as on
// screen (format.money), in both languages.
const amount = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const money = (value: number, currency: string) => `${currency} ${amount(value)}`;
const percent = (rate: number) => `${Math.round(rate * 10000) / 100}%`;

// ── The model: what the PDF says, independent of drawing ────────────────

export type StatementPdfModel = {
  locale: Locale;
  direction: 'ltr' | 'rtl';
  title: string;
  kind: string;
  number: string;
  meta: [string, string][];
  notices: string[];
  merchantHeading: string;
  merchant: string[];
  linesHeading: string;
  columns: { label: string; numeric: boolean; width: number }[];
  rows: string[][];
  totalsRow: string[];
  summaryHeading: string;
  summary: { label: string; value: string }[];
  total: { label: string; value: string };
  wordsLabel: string;
  words: string;
  settlements: { heading: string; rows: string[][]; columns: string[]; empty: string; balance: { label: string; value: string } } | null;
  notesHeading: string;
  notes: string[];
  footer: string[];
};

export const statementPdfModel = (statement: Statement, locale: Locale = 'en', now: Date = new Date()): StatementPdfModel => {
  const { doc, shipments } = MESSAGES[locale];
  const intl = INTL[locale];
  const dubaiDate = (iso: string) =>
    new Intl.DateTimeFormat(intl, { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  const calendarDate = (isoDate: string) =>
    new Intl.DateTimeFormat(intl, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${isoDate}T00:00:00Z`));

  const cod = statement.kind === 'cod_remittance';
  const currency = statement.currency;
  const total = statementTotal(statement);
  const m = statement.merchant;

  const summaryLabel = (row: SummaryRow) => {
    if (row.key === 'totalCod' && statement.accountingVersion === 2) return doc.summary.totalCodV2;
    if (row.key === 'cashHandlingFee') {
      return fill(statement.ratesVary ? doc.summary.cashHandlingFeeVaried : doc.summary.cashHandlingFee, {
        rate: percent(statement.cashHandlingRate),
        base: money(statement.cashHandlingBase, currency),
      });
    }
    if (row.key === 'paymentsReceived' && statement.kind === 'service_charges') return doc.summary.paymentsReceivedDeducted;
    return doc.summary[row.key];
  };

  // As the on-screen statement: a cash-handling column only when it carries one (pre-0051).
  const handling = cod && statement.cashHandlingFee > 0;
  const columns: StatementPdfModel['columns'] = [
    { label: doc.lines.col.no, numeric: false, width: 9 },
    { label: doc.lines.col.date, numeric: false, width: 22 },
    { label: doc.lines.col.tracking, numeric: false, width: 24 },
    { label: doc.lines.col.recipient, numeric: false, width: cod ? 40 : 72 },
    { label: doc.lines.col.type, numeric: false, width: 28 },
    { label: doc.lines.col.status, numeric: false, width: 20 },
    ...(cod ? [{ label: doc.lines.col.cod, numeric: true, width: 26 }] : []),
    { label: doc.lines.col.service, numeric: true, width: 24 },
    { label: doc.lines.col.return, numeric: true, width: 22 },
    ...(handling ? [{ label: doc.lines.col.handling, numeric: true, width: 24 }] : []),
    { label: doc.lines.col.paid, numeric: true, width: 24 },
  ];

  const cents = { cod: 0, service: 0, returns: 0, handling: 0, paid: 0 };
  let unsupported = false;
  const text = (value: string) => {
    const result = drawable(value);
    unsupported ||= result.replaced;
    return result.text;
  };

  const rows = statement.lines.map((line) => {
    cents.cod += Math.round(line.codCollected * 100);
    cents.service += Math.round(line.serviceCharge * 100);
    cents.returns += Math.round(line.returnCharge * 100);
    cents.handling += Math.round(line.cashHandlingFee * 100);
    cents.paid += Math.round(line.paymentsReceived * 100);
    return [
      String(line.lineNumber),
      dubaiDate(line.eventAt),
      line.trackingNumber,
      text(line.recipientName),
      line.deliveryType ? shipments.deliveryType[line.deliveryType].label : '-',
      doc.lines[line.event] + (line.codUnverified > 0 || line.codUncollected > 0 ? ' *' : ''),
      ...(cod ? [amount(line.codCollected)] : []),
      amount(line.serviceCharge),
      amount(line.returnCharge),
      ...(handling ? [amount(line.cashHandlingFee)] : []),
      amount(line.paymentsReceived),
    ];
  });
  const totalsRow = [
    doc.lines.totals,
    '',
    '',
    '',
    '',
    '',
    ...(cod ? [amount(cents.cod / 100)] : []),
    amount(cents.service / 100),
    amount(cents.returns / 100),
    ...(handling ? [amount(cents.handling / 100)] : []),
    amount(cents.paid / 100),
  ];

  const notices: string[] = [];
  if (statement.status === 'draft') notices.push(doc.draftNotice);
  if (statement.status === 'superseded') {
    notices.push(
      fill(doc.supersededNotice, {
        number: statement.supersededByNumber ?? '-',
        date: statement.supersededAt ? dubaiDate(statement.supersededAt) : '-',
      }),
    );
  }
  if (statement.correctionReason) {
    notices.push(fill(doc.correctionNotice, { number: statement.supersedesNumber ?? '-', reason: text(statement.correctionReason) }));
  }

  const notes = [doc.notes.basis, doc.notes.serviceRule];
  if (statement.accountingVersion === 2) notes.push(doc.notes.codPrincipalRule);
  notes.push(fill(doc.notes.returnRule, { rate: percent(statement.returnChargeRate) }));
  if (handling) notes.push(fill(doc.notes.handlingRule, { rate: percent(statement.cashHandlingRate) }));
  if (statement.ratesVary) notes.push(doc.notes.ratesVary);
  notes.push(statement.accountingVersion === 2 ? doc.notes.paidRuleV2 : doc.notes.paidRule);
  if (statement.codAlreadyRemitted > 0) notes.push(doc.notes.remittedRule);
  if (statement.codUnverified > 0) notes.push(fill(doc.notes.unverified, { amount: money(statement.codUnverified, currency) }));
  if (statement.codUncollected > 0) notes.push(fill(doc.notes.uncollected, { amount: money(statement.codUncollected, currency) }));
  if (statement.feesUnverified > 0) notes.push(fill(doc.notes.feesUnverified, { amount: money(statement.feesUnverified, currency) }));

  const merchant = [
    text(m.name),
    ...(m.contactPerson ? [text(fill(doc.contactPerson, { name: m.contactPerson }))] : []),
    ...([m.address, m.city, m.country].filter(Boolean).length ? [text([m.address, m.city, m.country].filter(Boolean).join(', '))] : []),
    ...(m.email ? [text(m.email)] : []),
    ...(m.phone ? [text(m.phone)] : []),
    ...(m.trn ? [text(fill(doc.trn, { trn: m.trn }))] : []),
    `${doc.accountId} ${statement.businessAccountId.slice(0, 8).toUpperCase()}`,
  ];

  // Payments recorded so far — not part of the frozen statement, so dated.
  const settlements =
    statement.status === 'draft'
      ? null
      : {
          heading: fill(doc.settlements.heading, { date: dubaiDate(now.toISOString()) }),
          columns: [doc.settlements.col.date, doc.settlements.col.direction, doc.settlements.col.method, doc.settlements.col.reference, doc.settlements.col.amount],
          rows: statement.settlements.map((s) => [
            calendarDate(s.paidOn),
            (s.direction === 'to_merchant' ? doc.settlements.toMerchant : doc.settlements.fromMerchant) +
              (s.status === 'void' ? ` (${doc.settlements.void})` : ''),
            doc.settlements.methods[s.method],
            text(s.reference ?? '-'),
            money(s.amount, currency),
          ]),
          empty: doc.settlements.none,
          balance: {
            label: doc.settlements.balance[balanceLabel(statement.balance)],
            value: money(Math.abs(statement.balance.balance), currency),
          },
        };

  // Decided last, once every name has been checked.
  if (unsupported) notes.push(doc.notes.pdfCharacters);

  return {
    locale,
    direction: locale === 'ar' ? 'rtl' : 'ltr',
    title: doc.title,
    kind: doc.kind[statement.kind],
    number: statement.statementNumber ?? doc.draftNumber,
    meta: [
      [doc.number, statement.statementNumber ?? doc.draftNumber],
      [doc.period, `${calendarDate(statement.periodStart)} - ${calendarDate(statement.periodEnd)}`],
      [statement.publishedAt ? doc.published : doc.generated, dubaiDate(statement.publishedAt ?? statement.generatedAt)],
      [doc.currency, currency],
    ],
    notices,
    merchantHeading: doc.statementFor,
    merchant,
    linesHeading: doc.lines.heading,
    columns,
    rows,
    totalsRow,
    summaryHeading: doc.summary.heading[statement.kind],
    summary: statementSummary(statement).map((row) => ({
      label: summaryLabel(row),
      value: `${row.sign === '-' && row.amount > 0 ? '- ' : row.sign === '+' && row.amount > 0 ? '+ ' : ''}${money(row.amount, currency)}`,
    })),
    total: { label: locale === 'en' ? doc.total[total.label].toUpperCase() : doc.total[total.label], value: money(total.amount, currency) },
    wordsLabel: doc.words,
    words: total.words,
    settlements,
    notesHeading: doc.notes.heading,
    notes,
    footer: [doc.footer, fill(doc.questions, { email: COMPANY.email, phone: COMPANY.phone })],
  };
};

// ── Drawing ──────────────────────────────────────────────────────────────

const PAGE = { width: 297, height: 210 };
const MARGIN = 14;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

export const renderStatementPdf = (statement: Statement, locale: Locale = 'en', now: Date = new Date()): ArrayBuffer => {
  const model = statementPdfModel(statement, locale, now);
  const rtl = model.direction === 'rtl';
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  registerFonts(pdf);
  pdf.setProperties({ title: `${model.title} ${model.number}`, subject: model.kind, author: COMPANY.name, creator: COMPANY.name });
  pdf.setLanguage(rtl ? 'ar' : 'en-GB');

  // Layout is written left to right; for Arabic every position is mirrored
  // and "start"/"end" alignment swaps, so the page reads right to left.
  const X = (x: number) => (rtl ? PAGE.width - x : x);
  const start = rtl ? 'right' : 'left';
  const end = rtl ? 'left' : 'right';

  let y = MARGIN;
  const ensure = (height: number, onNewPage?: () => void) => {
    if (y + height > PAGE.height - MARGIN) {
      pdf.addPage();
      y = MARGIN;
      onNewPage?.();
    }
  };
  type Style = { size?: number; bold?: boolean; color?: number };
  // `at` is a left-to-right position; `align` is logical (start/end).
  const write = (value: string, at: number, align: 'start' | 'end', style: Style = {}) =>
    drawText(pdf, value, X(at), y, { size: style.size ?? 9, bold: style.bold, color: style.color, align: align === 'start' ? start : end });
  const rule = (from: number, to: number, width: number, gray: number) => {
    pdf.setLineWidth(width);
    pdf.setDrawColor(gray);
    pdf.line(X(from), y, X(to), y);
  };
  const paragraph = (value: string, size = 8, color = 70) => {
    for (const line of wrapText(pdf, value, CONTENT_WIDTH, { size })) {
      ensure(4.5);
      write(line, MARGIN, 'start', { size, color });
      y += size * 0.5;
    }
  };

  // Header
  y += 6;
  write(COMPANY.name, MARGIN, 'start', { size: 14, bold: true });
  write(model.title, PAGE.width - MARGIN, 'end', { size: 16, bold: true });
  y += 6;
  write(`${COMPANY.email} · ${COMPANY.phone} · ${COMPANY.website}`, MARGIN, 'start', { size: 8, color: 90 });
  write(model.kind, PAGE.width - MARGIN, 'end', { size: 9, color: 90 });
  y += 6;
  for (const [label, value] of model.meta) {
    write(label, PAGE.width - MARGIN - 62, 'start', { size: 8, color: 110 });
    write(value, PAGE.width - MARGIN, 'end', { size: 8, bold: true });
    y += 4.5;
  }
  y += 1;
  rule(MARGIN, PAGE.width - MARGIN, 0.6, 20);
  y += 6;

  for (const notice of model.notices) paragraph(notice, 9, 150);
  if (model.notices.length) y += 2;

  write(model.merchantHeading, MARGIN, 'start', { size: 7.5, bold: true, color: 110 });
  y += 4.5;
  model.merchant.forEach((line, index) => {
    ensure(5);
    write(line, MARGIN, 'start', { size: index === 0 ? 11 : 8.5, bold: index === 0 });
    y += index === 0 ? 5.5 : 4.2;
  });
  y += 4;

  // Lines
  const scale = CONTENT_WIDTH / model.columns.reduce((sum, column) => sum + column.width, 0);
  const lefts: number[] = [];
  model.columns.reduce((x, column) => {
    lefts.push(x);
    return x + column.width * scale;
  }, MARGIN);
  // Numbers sit at the column's end edge, text at its start edge.
  const cellAt = (index: number) =>
    model.columns[index].numeric ? { at: lefts[index] + model.columns[index].width * scale - 1, align: 'end' as const } : { at: lefts[index], align: 'start' as const };
  const drawRow = (cells: string[], style: Style = {}) => {
    cells.forEach((cell, index) => {
      if (!cell) return;
      const size = style.size ?? 7.5;
      // Text may run into the following columns while they are empty (the
      // totals row's label spans the descriptive columns).
      let width = model.columns[index].width;
      for (let next = index + 1; next < cells.length && !cells[next] && !model.columns[index].numeric; next += 1) width += model.columns[next].width;
      const fitted = fitText(pdf, cell, width * scale - 2, { size, bold: style.bold });
      const { at, align } = cellAt(index);
      write(fitted, at, align, { ...style, size });
    });
  };
  const header = () => {
    drawRow(model.columns.map((column) => (model.locale === 'en' ? column.label.toUpperCase() : column.label)), { bold: true, size: 6.5, color: 100 });
    y += 1.5;
    rule(MARGIN, PAGE.width - MARGIN, 0.3, 150);
    y += 4;
  };

  write(model.linesHeading, MARGIN, 'start', { size: 9, bold: true });
  y += 5;
  header();
  for (const row of model.rows) {
    ensure(5, header);
    drawRow(row);
    y += 1.5;
    rule(MARGIN, PAGE.width - MARGIN, 0.1, 210);
    y += 3.5;
  }
  ensure(7, header);
  y -= 2.5;
  rule(MARGIN, PAGE.width - MARGIN, 0.5, 20);
  y += 3.5;
  drawRow(model.totalsRow, { bold: true });
  y += 9;

  // Calculation (at the page's end side)
  const blockStart = PAGE.width - MARGIN - 130;
  ensure(12 + model.summary.length * 6);
  write(model.summaryHeading, blockStart, 'start', { size: 9, bold: true });
  y += 6;
  for (const row of model.summary) {
    // A long label wraps; the amount stays on its first line.
    const labelLines = wrapText(pdf, row.label, 95, { size: 8.5 });
    ensure(1.5 + labelLines.length * 4.2);
    write(row.value, PAGE.width - MARGIN, 'end', { size: 8.5 });
    labelLines.forEach((line, index) => {
      write(line, blockStart, 'start', { size: 8.5 });
      if (index < labelLines.length - 1) y += 4;
    });
    y += 5.5;
  }
  ensure(16);
  y -= 3;
  rule(blockStart, PAGE.width - MARGIN, 0.6, 20);
  y += 5;
  write(model.total.label, blockStart, 'start', { size: 11, bold: true });
  write(model.total.value, PAGE.width - MARGIN, 'end', { size: 11, bold: true });
  y += 6;
  write(model.wordsLabel, blockStart, 'start', { size: 8.5, bold: true });
  y += 4.5;
  for (const line of wrapText(pdf, model.words, 130, { size: 8.5 })) {
    ensure(4.5);
    write(line, blockStart, 'start', { size: 8.5 });
    y += 4.2;
  }
  y += 6;

  // Payments recorded against the statement
  if (model.settlements) {
    const s = model.settlements;
    ensure(14 + Math.max(s.rows.length, 1) * 5);
    write(s.heading, MARGIN, 'start', { size: 9, bold: true });
    y += 5;
    const widths = [30, 50, 40, 60, 40];
    const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((a, b) => a + b, 0));
    const drawSettlementRow = (cells: string[], style: Style) =>
      cells.forEach((cell, i) => {
        const last = i === cells.length - 1;
        write(fitText(pdf, cell, widths[i] - 2, { size: style.size ?? 8, bold: style.bold }), last ? xs[i] + widths[i] : xs[i], last ? 'end' : 'start', style);
      });
    drawSettlementRow(s.columns, { size: 7, bold: true, color: 100 });
    y += 4.5;
    if (s.rows.length === 0) {
      write(s.empty, MARGIN, 'start', { size: 8, color: 90 });
      y += 4.5;
    }
    for (const row of s.rows) {
      ensure(5);
      drawSettlementRow(row, { size: 8 });
      y += 4.5;
    }
    y += 1;
    write(s.balance.label, MARGIN, 'start', { size: 9, bold: true });
    write(s.balance.value, xs[4] + widths[4], 'end', { size: 9, bold: true });
    y += 8;
  }

  // Notes and footer
  ensure(10);
  write(model.notesHeading, MARGIN, 'start', { size: 7.5, bold: true, color: 70 });
  y += 4.5;
  for (const note of model.notes) paragraph(note, 7.5);
  y += 3;
  for (const line of model.footer) paragraph(line, 7.5, 90);

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    y = PAGE.height - 7;
    write(`${model.number} · ${page} / ${pages}`, PAGE.width - MARGIN, 'end', { size: 7, color: 130 });
  }

  return pdf.output('arraybuffer');
};
