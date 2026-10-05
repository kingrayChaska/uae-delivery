import { describe, expect, it } from 'vitest';

import { parseCsvRecords } from '@/lib/csv/parse';
import { toCsv } from '@/lib/csv/serialize';
import { MERCHANT_BULK_COLUMNS, parseMerchantRow, readMerchantTable, toMerchantRowInput } from '@/lib/bulk/merchant-csv';
import { COLUMN_GUIDE, XLSX_HEADER_ROW, crc32, merchantTemplateParts, merchantTemplateXlsx } from '@/lib/bulk/merchant-template-xlsx';

const TODAY = '2026-10-05';

const parts = merchantTemplateParts(TODAY);
const strings = [...parts['xl/sharedStrings.xml'].matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((m) => m[1]);

// The Shipments sheet's rows as Excel would save them to CSV.
const sheetRows = () =>
  [...parts['xl/worksheets/sheet1.xml'].matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)].map(([, number, body]) => ({
    number: Number(number),
    cells: [...body.matchAll(/<c r="[A-Z]+\d+" s="\d+"(?: t="s")?(?:\/>|><v>([^<]*)<\/v><\/c>)/g)].map(([whole, value]) =>
      value === undefined ? '' : whole.includes('t="s"') ? strings[Number(value)].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : value,
    ),
  }));

describe('merchant Excel template', () => {
  it('is a ZIP holding every workbook part', () => {
    const bytes = merchantTemplateXlsx(TODAY);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    for (const path of Object.keys(parts)) expect(text).toContain(path);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('keeps the 8 canonical column names, alone, on the header row', () => {
    const header = sheetRows().find((row) => row.number === XLSX_HEADER_ROW);
    expect(header?.cells).toEqual([...MERCHANT_BULK_COLUMNS]);
  });

  it('brands, explains, gives an example, and lists what is not needed', () => {
    const all = strings.join('\n');
    expect(all).toContain('ParcelLink UAE');
    expect(all).toMatch(/Example — do not upload/);
    expect(all).toMatch(/Next Day/);
    expect(all).toMatch(/COD/);
    for (const notNeeded of ['Pickup Address', 'Delivery Type', 'COD Type', 'Package Value', 'Fragile', 'Pickup Contact', 'Distance', 'Delivery Fee']) {
      expect(all).toContain(notNeeded);
    }
    expect(COLUMN_GUIDE.cod_amount.label).toMatch(/Cash to Collect/);
    expect(COLUMN_GUIDE.date.label).toBe('Delivery Date');
  });

  it('freezes the header, protects it, and validates the data cells', () => {
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain(`<pane ySplit="${XLSX_HEADER_ROW}"`);
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<sheetProtection sheet="1"');
    expect(sheet).toMatch(/type="whole" operator="greaterThanOrEqual"[^>]*sqref="E6:E1005"><formula1>1</);
    expect(sheet).toMatch(/type="decimal" operator="greaterThan"[^>]*sqref="F6:F1005"><formula1>0</);
    expect(sheet).toMatch(/type="decimal" operator="between"[^>]*sqref="G6:G1005"/);
    expect(sheet).toMatch(/type="date" operator="between"[^>]*sqref="H6:H1005"><formula1>TODAY\(\)\+1</);
    // Phone numbers get guidance, never a restrictive rule.
    expect(sheet).toMatch(/<dataValidation allowBlank="1" showInputMessage="1" promptTitle="Recipient Phone Number"[^>]*sqref="B6:B1005"\/>/);
    // Data cells (column styles) are unlocked; the header style is not.
    expect(parts['xl/styles.xml'].match(/<protection locked="0"\/>/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('round-trips: saved as CSV with data typed in, it uploads only the typed rows', () => {
    const rows = sheetRows().map((row) => row.cells);
    const typed = ['Fatima Hassan', '+971521234567', 'Jumeirah 1, Dubai', 'Cosmetics', '2', '1.5', '200', '2026-10-06'];
    const csv = toCsv(rows[0], [...rows.slice(1), typed]);
    const table = readMerchantTable(parseCsvRecords(csv));
    if ('error' in table) throw new Error(table.error);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].row).toBe(XLSX_HEADER_ROW + 1);
    const input = toMerchantRowInput(Object.fromEntries(table.headers.map((h, i) => [h, table.rows[0].cells[i] ?? ''])));
    const { row, issues } = parseMerchantRow(input, TODAY);
    expect(issues).toEqual([]);
    expect(row).toMatchObject({ recipientName: 'Fatima Hassan', codAmount: 200, deliveryDate: '2026-10-06' });
  });
});
