import { afterEach, describe, expect, it, vi } from 'vitest';

import { codStatement, serviceStatement } from '@/lib/finance/fixtures.test-helpers';
import { isStatementNumber, statementSummary, statementTotal, summaryMatchesNet } from '@/lib/finance/statements';
import { statementPdfModel, renderStatementPdf } from '@/lib/finance/statement-pdf';

// The arrangement every view shares. The amounts themselves are the
// database's (covered by database/test/financial-reporting.sql); these tests
// check that what is shown — rows, final figure and words — is a faithful
// reading of the stored figures, and that the PDF says exactly the same.

// What the PDF is asked to draw: each pdf.text() call, in order. Text in an
// embedded font is stored as glyph numbers, so the bytes can't be searched;
// jsPDF defines text() per instance, so each new document's is wrapped.
const drawCalls = vi.hoisted(() => [] as { text: string; x: number; y: number }[]);
vi.mock('jspdf', async (importOriginal) => {
  const mod = await importOriginal<typeof import('jspdf')>();
  class RecordingPdf extends mod.jsPDF {
    constructor(...args: ConstructorParameters<typeof mod.jsPDF>) {
      super(...args);
      const text = this.text.bind(this);
      this.text = ((...textArgs: Parameters<typeof text>) => {
        drawCalls.push({ text: String(textArgs[0]), x: Number(textArgs[1]), y: Number(textArgs[2]) });
        return text(...textArgs);
      }) as typeof text;
    }
  }
  return { ...mod, jsPDF: RecordingPdf };
});

const drawnText = (render: () => ArrayBuffer) => {
  drawCalls.length = 0;
  const output = Buffer.from(render()).toString('latin1');
  const calls = [...drawCalls];
  return { calls, strings: calls.map((call) => call.text), output };
};

afterEach(() => vi.restoreAllMocks());

describe('statementSummary / statementTotal', () => {
  // New statements show separately paid service charges without adding them
  // back to COD; only unpaid service charges reduce the remittance.
  it('COD statement: unpaid delivery and return charges reduce COD once', () => {
    const s = { ...codStatement(), cashHandlingFee: 0, netAmount: 8300, lines: codStatement().lines.map((l) => ({ ...l, cashHandlingFee: 0 })) };
    expect(statementSummary(s)).toEqual([
      { key: 'totalCod', amount: 10000, sign: '' },
      { key: 'serviceChargesDue', amount: 1500, sign: '-' },
      { key: 'returnCharges', amount: 200, sign: '-' },
    ]);
    expect(statementTotal(s).amount).toBe(8300);
    expect(summaryMatchesNet(s)).toBe(true);
  });

  // Statements issued before accounting version 2 retain their original rows.
  it('legacy COD statement retains its original calculation presentation', () => {
    const s = { ...codStatement(), accountingVersion: 1 as const };
    expect(statementSummary(s)).toEqual([
      { key: 'totalCod', amount: 10000, sign: '' },
      { key: 'serviceCharges', amount: 1500, sign: '-' },
      { key: 'returnCharges', amount: 200, sign: '-' },
      { key: 'cashHandlingFee', amount: 150, sign: '-' },
    ]);
    expect(statementTotal(s)).toEqual({
      label: 'netRemittance',
      amount: 8150,
      words: 'Eight Thousand One Hundred Fifty UAE Dirhams Only',
    });
    expect(summaryMatchesNet(s)).toBe(true);
  });

  it('service statement: never shows a COD line, and the amount is due from the merchant', () => {
    const s = serviceStatement();
    const rows = statementSummary(s);
    expect(rows.map((row) => row.key)).not.toContain('totalCod');
    expect(rows.map((row) => row.key)).not.toContain('cashHandlingFee');
    expect(rows).toEqual([
      { key: 'serviceCharges', amount: 2550, sign: '' },
      { key: 'returnCharges', amount: 0, sign: '+' },
      { key: 'paymentsReceived', amount: 100, sign: '-' },
    ]);
    expect(statementTotal(s)).toEqual({
      label: 'amountDue',
      amount: 2450,
      words: 'Two Thousand Four Hundred Fifty UAE Dirhams Only',
    });
    expect(summaryMatchesNet(s)).toBe(true);
  });

  it('mixed account owing more than its COD: amount due, not a remittance', () => {
    const s = { ...codStatement(), totalCod: 100, cashHandlingBase: 100, cashHandlingFee: 1.5, netAmount: -1601.5, outcome: 'due_from_merchant' as const };
    expect(summaryMatchesNet(s)).toBe(true);
    expect(statementTotal(s)).toMatchObject({ label: 'amountDue', amount: 1601.5 });
    expect(statementTotal(s).words).toBe('One Thousand Six Hundred One UAE Dirhams and Fifty Fils Only');
  });

  it('COD already paid out and fees already paid are shown, and still add up', () => {
    const s = {
      ...codStatement(),
      codAlreadyRemitted: 300,
      paymentsReceived: 17,
      netAmount: 8150 - 300 + 17,
    };
    expect(statementSummary(s).map((row) => `${row.sign === 'info' ? 'info-' : row.sign}${row.key}`)).toEqual([
      'totalCod',
      '-codAlreadyRemitted',
      'info-serviceChargesPaid',
      '-serviceChargesDue',
      '-returnCharges',
      '-cashHandlingFee',
    ]);
    expect(summaryMatchesNet(s)).toBe(true);
  });

  it('separately paid service fees are informational and are not deducted or added back', () => {
    const s = {
      ...codStatement(),
      accountingVersion: 2 as const,
      totalCod: 3043.99,
      serviceCharges: 405,
      returnCharges: 37.5,
      cashHandlingFee: 0,
      paymentsReceived: 405,
      netAmount: 3006.49,
    };
    expect(statementSummary(s)).toEqual([
      { key: 'totalCod', amount: 3043.99, sign: '' },
      { key: 'serviceChargesPaid', amount: 405, sign: 'info' },
      { key: 'returnCharges', amount: 37.5, sign: '-' },
    ]);
    expect(statementTotal(s)).toMatchObject({
      amount: 3006.49,
      words: 'Three Thousand Six UAE Dirhams and Forty-Nine Fils Only',
    });
    expect(summaryMatchesNet(s)).toBe(true);
  });

  it('unpaid service fees are deducted once, with no paid-fee add-back', () => {
    const s = {
      ...codStatement(),
      accountingVersion: 2 as const,
      totalCod: 3043.99,
      serviceCharges: 405,
      returnCharges: 37.5,
      cashHandlingFee: 0,
      paymentsReceived: 0,
      netAmount: 2601.49,
    };
    expect(statementSummary(s)).toEqual([
      { key: 'totalCod', amount: 3043.99, sign: '' },
      { key: 'serviceChargesDue', amount: 405, sign: '-' },
      { key: 'returnCharges', amount: 37.5, sign: '-' },
    ]);
    expect(statementTotal(s)).toMatchObject({
      amount: 2601.49,
      words: 'Two Thousand Six Hundred One UAE Dirhams and Forty-Nine Fils Only',
    });
    expect(summaryMatchesNet(s)).toBe(true);
  });

  it('does not treat missing payment evidence as paid and caps paid fees at service charges', () => {
    const unpaid = { ...codStatement(), accountingVersion: 2 as const, paymentsReceived: 0, netAmount: 8150 };
    expect(statementSummary(unpaid).map((row) => row.key)).toContain('serviceChargesDue');
    expect(summaryMatchesNet(unpaid)).toBe(true);

    const capped = { ...unpaid, paymentsReceived: 2000, netAmount: 10000 - 200 - 150 };
    expect(statementSummary(capped)).toContainEqual({ key: 'serviceChargesPaid', amount: 1500, sign: 'info' });
    expect(statementSummary(capped).map((row) => row.key)).not.toContain('serviceChargesDue');
    expect(summaryMatchesNet(capped)).toBe(true);
  });

  it('settled and credit balances', () => {
    expect(statementTotal({ ...serviceStatement(), netAmount: 0, outcome: 'settled' })).toMatchObject({ label: 'settled', amount: 0, words: 'Zero UAE Dirhams Only' });
    expect(statementTotal({ ...serviceStatement(), netAmount: 20, outcome: 'payable_to_merchant' })).toMatchObject({ label: 'creditDue', amount: 20 });
  });

  it('detects a summary that would not add up', () => {
    expect(summaryMatchesNet({ ...codStatement(), netAmount: 8151 })).toBe(false);
  });

  it('recognises statement numbers', () => {
    expect(isStatementNumber('STM-2026-000123')).toBe(true);
    expect(isStatementNumber('INV-2026-000123')).toBe(false);
    expect(isStatementNumber('STM-2026-1')).toBe(false);
  });
});

describe('statement PDF', () => {
  it.each([
    ['COD', codStatement],
    ['service', serviceStatement],
  ])('%s statement: the PDF shows exactly the portal’s figures and words', (_, make) => {
    const s = make();
    const model = statementPdfModel(s);
    const total = statementTotal(s);
    expect(model.words).toBe(total.words);
    expect(model.total.value).toBe(`AED ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(total.amount)}`);
    expect(model.summary.map((row) => row.value.replace(/^[-+] /, ''))).toEqual(
      statementSummary(s).map((row) => `AED ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(row.amount)}`),
    );
    expect(model.rows).toHaveLength(s.lines.length);
    expect(model.number).toBe(s.statementNumber);
  });

  it('exports the corrected paid-fee and unpaid-fee calculation without changing its total or words', () => {
    for (const s of [
      {
        ...codStatement(),
        accountingVersion: 2 as const,
        totalCod: 3043.99,
        serviceCharges: 405,
        returnCharges: 37.5,
        cashHandlingFee: 0,
        paymentsReceived: 405,
        netAmount: 3006.49,
      },
      {
        ...codStatement(),
        accountingVersion: 2 as const,
        totalCod: 3043.99,
        serviceCharges: 405,
        returnCharges: 37.5,
        cashHandlingFee: 0,
        paymentsReceived: 0,
        netAmount: 2601.49,
      },
    ]) {
      const model = statementPdfModel(s);
      expect(model.summary.map((row) => row.label)).toEqual(
        statementSummary(s).map((row) =>
          row.key === 'totalCod'
            ? 'COD collected for you (not ParcelLink revenue)'
            : row.key === 'serviceChargesPaid'
              ? 'Service charges paid separately (not deducted)'
              : row.key === 'serviceChargesDue'
                ? 'Less: unpaid service charges deducted from COD'
                : row.key === 'returnCharges'
                  ? 'Return charges'
                  : row.key,
        ),
      );
      expect(model.total.value).toBe(`AED ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(statementTotal(s).amount)}`);
      expect(model.words).toBe(statementTotal(s).words);
    }
  });

  it('lists every line once, with column totals equal to the statement totals', () => {
    const s = codStatement();
    const model = statementPdfModel(s);
    const codColumn = model.columns.findIndex((column) => column.label === 'COD collected');
    expect(model.totalsRow[codColumn]).toBe('10,000.00');
    expect(model.rows.map((row) => row[2])).toEqual(['TRK00001', 'TRK00002', 'TRK00003']);
  });

  it('has no COD or cash-handling columns on a service statement', () => {
    const labels = statementPdfModel(serviceStatement()).columns.map((column) => column.label);
    expect(labels).not.toContain('COD collected');
    expect(labels).not.toContain('Cash handling');
  });

  it('marks a draft and a superseded statement', () => {
    expect(statementPdfModel({ ...codStatement(), status: 'draft', statementNumber: null }).number).toBe('DRAFT');
    expect(
      statementPdfModel({ ...codStatement(), status: 'superseded', supersededByNumber: 'STM-2026-000009', supersededAt: '2026-02-03T08:00:00Z' })
        .notices[0],
    ).toContain('STM-2026-000009');
  });

  it('keeps Arabic names, and only replaces characters no font has', () => {
    const s = codStatement();
    s.lines[0].recipientName = 'محمد';
    s.lines[1].recipientName = '张三';
    const model = statementPdfModel(s);
    expect(model.rows[0][3]).toBe('محمد');
    expect(model.rows[1][3]).toBe('??');
    expect(model.notes.at(-1)).toMatch(/can’t display/);
    expect(statementPdfModel(codStatement()).notes.join(' ')).not.toMatch(/can’t display/);
  });

  it('renders a PDF that draws the final figure and the words, with embedded fonts', () => {
    const drawn = drawnText(() => renderStatementPdf(codStatement()));
    expect(drawn.output.startsWith('%PDF-')).toBe(true);
    expect(drawn.output).toContain('/FontFile2');
    expect(drawn.strings).toContain('AED 8,150.00');
    expect(drawn.strings).toContain('Eight Thousand One Hundred Fifty UAE Dirhams Only');
    expect(drawn.strings).toContain('TOTAL REMITTANCE');
  });

  it('renders the statement in Arabic, right to left, with the same figures', () => {
    const ar = statementPdfModel(codStatement(), 'ar');
    expect(ar.direction).toBe('rtl');
    expect(ar.title).toBe('كشف حساب التاجر');
    expect(ar.total).toEqual({ label: 'إجمالي مبلغ التحويل', value: 'AED 8,150.00' });
    expect(ar.words).toBe(statementTotal(codStatement()).words);
    expect(ar.summary.map((row) => row.value)).toEqual(statementPdfModel(codStatement(), 'en').summary.map((row) => row.value));

    const drawn = drawnText(() => renderStatementPdf(codStatement(), 'ar'));
    // The title's words are drawn right to left: التاجر · حساب · كشف.
    const title = drawn.calls.filter((call) => ['كشف', 'حساب', 'التاجر'].includes(call.text));
    expect(title.slice(0, 3).map((call) => call.text)).toEqual(['التاجر', 'حساب', 'كشف']);
    expect(title[0].x).toBeLessThan(title[1].x);
    expect(title[1].x).toBeLessThan(title[2].x);
    expect(drawn.strings).toContain('AED 8,150.00');
  });

  it('lists payments recorded and the balance left', () => {
    const s = {
      ...codStatement(),
      settlements: [
        { id: 'p1', statementId: codStatement().id, statementNumber: 'STM-2026-000001', direction: 'to_merchant' as const, amount: 5000,
          method: 'bank_transfer' as const, reference: 'TRF-1', notes: null, paidOn: '2026-02-05', status: 'recorded' as const, voidReason: null, createdAt: '2026-02-05T08:00:00Z' },
      ],
      balance: { paidToMerchant: 5000, paidByMerchant: 0, balance: 3150, status: 'partially_settled' as const },
    };
    const model = statementPdfModel(s, 'en', new Date('2026-02-06T08:00:00Z'));
    expect(model.settlements?.rows).toEqual([['5 Feb 2026', 'Paid to you', 'Bank transfer', 'TRF-1', 'AED 5,000.00']]);
    expect(model.settlements?.balance).toEqual({ label: 'Still to be paid to you', value: 'AED 3,150.00' });
    expect(statementPdfModel({ ...codStatement(), status: 'draft' }).settlements).toBeNull();
  });

  it('says when rates changed during the period', () => {
    const model = statementPdfModel({ ...codStatement(), ratesVary: true });
    expect(model.notes.join(' ')).toMatch(/rates changed during this period/);
    expect(model.summary.find((row) => row.label.startsWith('Cash-handling'))?.label).toMatch(/rate in force each day/);
  });

  it('paginates a long statement', () => {
    const s = codStatement();
    s.lines = Array.from({ length: 120 }, (_, i) => ({ ...s.lines[0], lineNumber: i + 1, trackingNumber: `T${i}` }));
    const text = Buffer.from(renderStatementPdf(s)).toString('latin1');
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});
