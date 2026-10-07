import { describe, expect, it } from 'vitest';

import { parseCsvRecords } from '@/lib/csv/parse';
import { toCsv } from '@/lib/csv/serialize';
import { MERCHANT_BULK_COLUMNS, parseMerchantRow, readMerchantTable, toMerchantRowInput } from '@/lib/bulk/merchant-csv';
import {
  SHEET_NAME,
  XLSX_HEADER_ROW,
  columnGuide,
  crc32,
  merchantTemplateParts,
  merchantTemplateXlsx,
  validationFormulas,
} from '@/lib/bulk/merchant-template-xlsx';

const TODAY = '2026-10-05';

const parts = merchantTemplateParts(TODAY);
const strings = [...parts['xl/sharedStrings.xml'].matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((m) => m[1]);
const sheet = parts['xl/worksheets/sheet1.xml'];

// The sheet's rows as Excel would save them to CSV.
const sheetRows = () =>
  [...sheet.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)].map(([, number, body]) => ({
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

  it('has a single "Bulk Shipments" sheet', () => {
    expect([...parts['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1])).toEqual([SHEET_NAME]);
  });

  it('keeps the 8 canonical column names, alone, on the header row', () => {
    const header = sheetRows().find((row) => row.number === XLSX_HEADER_ROW);
    expect(header?.cells).toEqual([...MERCHANT_BULK_COLUMNS]);
  });

  it('brands, explains and gives an example dated tomorrow', () => {
    const all = strings.join('\n');
    expect(all).toContain('ParcelLink UAE');
    expect(all).toMatch(/EXAMPLE - NOT UPLOADED/);
    expect(all).toMatch(/Next Day/);
    expect(all).toMatch(/CSV UTF-8/);
    expect(sheetRows().find((row) => row.number === 4)?.cells.at(-1)).toBe('2026-10-06');
    for (const column of MERCHANT_BULK_COLUMNS) expect(parts['xl/comments1.xml']).toContain(`ref="${String.fromCharCode(65 + MERCHANT_BULK_COLUMNS.indexOf(column))}${XLSX_HEADER_ROW}"`);
    expect(columnGuide(TODAY).cod_amount.note).toMatch(/more than 0/);
  });

  it('freezes the header and checks the data cells like the upload does', () => {
    expect(sheet).toContain(`<pane ySplit="${XLSX_HEADER_ROW}"`);
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toMatch(/type="whole" operator="between"[^>]*sqref="E6:E1005"><formula1>1<\/formula1><formula2>1000</);
    expect(sheet).toMatch(/type="decimal" operator="between"[^>]*sqref="F6:F1005"><formula1>0.01</);
    // COD: required and more than 0 (every bulk shipment is COD).
    expect(sheet).toMatch(/type="decimal" operator="between"[^>]*sqref="G6:G1005"><formula1>0.01<\/formula1><formula2>100000</);
    // A non-UAE phone only warns, as on upload.
    expect(sheet).toMatch(/type="custom" errorStyle="warning"[^>]*sqref="B6:B1005"/);
    expect(sheet).toMatch(/type="custom" errorStyle="stop"[^>]*sqref="H6:H1005"><formula1>AND\(LEN\(H6\)=10/);
    // Excel refuses validation formulas over 255 characters.
    for (const formula of validationFormulas()) expect(formula.length).toBeLessThanOrEqual(255);
  });

  it('round-trips: saved as CSV with data typed in, it uploads only the typed rows', () => {
    const rows = sheetRows().map((row) => row.cells);
    const typed = ['Fatima Hassan', '+971521234567', 'Jumeirah 1, Dubai', 'Cosmetics', '2', '1.50', '1,250.00', '2026-10-06'];
    // Typed into the first input row; the 199 formatted rows below stay empty.
    const csv = toCsv(rows[0], [...rows.slice(1, XLSX_HEADER_ROW), typed, ...rows.slice(XLSX_HEADER_ROW + 1)]);
    const table = readMerchantTable(parseCsvRecords(csv));
    if ('error' in table) throw new Error(table.error);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].row).toBe(XLSX_HEADER_ROW + 1);
    const input = toMerchantRowInput(Object.fromEntries(table.headers.map((h, i) => [h, table.rows[0].cells[i] ?? ''])));
    const { row, issues } = parseMerchantRow(input, TODAY);
    expect(issues).toEqual([]);
    expect(row).toMatchObject({ recipientName: 'Fatima Hassan', codAmount: 1250, weightKg: 1.5, deliveryDate: '2026-10-06' });
  });
});
