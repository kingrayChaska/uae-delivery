// The merchant bulk-shipment template as an Excel workbook (.xlsx): the
// same 8 machine-readable columns as the CSV, made self-explanatory for
// someone who isn't technical — branding, short instructions, an example
// row, per-column guidance and spreadsheet validation.
//
// Merchants fill the "Shipments" sheet and save it as CSV (the upload
// accepts CSV only). Everything above the column names on that sheet is
// guidance — the parser skips every line before the header row
// (findHeaderRow) — so the example can never be uploaded as a shipment.
//
// Built here without a library: an .xlsx is a ZIP of XML parts, and this
// one is small and fixed. Runs in the browser (and in tests).

import { MAX_COD_AMOUNT } from '@/lib/pricing/config';
import {
  MAX_DAYS_AHEAD,
  MERCHANT_BULK_COLUMNS,
  MERCHANT_BULK_MAX_ROWS,
  TEMPLATE_TITLE,
  templateExample,
} from '@/lib/bulk/merchant-csv';

import type { MerchantBulkColumn } from '@/lib/bulk/merchant-csv';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ── What each column means ──────────────────────────────────────────────────

type ColumnGuide = {
  label: string;
  // Shown when a cell of the column is selected (Excel: ≤ 255 characters).
  prompt: string;
  rule: string;
  width: number;
  kind: 'text' | 'whole' | 'decimal' | 'money' | 'date';
};

export const COLUMN_GUIDE: Record<MerchantBulkColumn, ColumnGuide> = {
  recipient_name: {
    label: 'Recipient Name',
    prompt: 'Full name of the person receiving the shipment.',
    rule: 'Required.',
    width: 24,
    kind: 'text',
  },
  recipient_phone: {
    label: 'Recipient Phone Number',
    prompt: "The recipient's phone number, preferably in UAE format: +971501234567 or 0501234567.",
    rule: 'Required. UAE numbers are best: the driver calls this number.',
    width: 20,
    kind: 'text',
  },
  delivery_address: {
    label: 'Delivery Address',
    prompt: 'The complete delivery location: building or villa, street, area and emirate. Example: Marina Gate 1, Dubai Marina, Dubai.',
    rule: 'Required. Write it as you would search for it on a map.',
    width: 44,
    kind: 'text',
  },
  package_description: {
    label: 'What is inside the package?',
    prompt: 'Briefly describe what is inside the package. Example: Electronics, Cosmetics, Clothes.',
    rule: 'Required.',
    width: 30,
    kind: 'text',
  },
  quantity: {
    label: 'Number of items',
    prompt: 'The number of items or packages. Whole numbers only (1, 2, 3…).',
    rule: 'Required. A whole number, 1 or more.',
    width: 12,
    kind: 'whole',
  },
  weight_kg: {
    label: 'Package Weight (kg)',
    prompt: 'The total package weight in kilograms. Example: 2.5',
    rule: 'Required. A number greater than 0.',
    width: 14,
    kind: 'decimal',
  },
  cod_amount: {
    label: 'Cash to Collect (AED)',
    prompt: 'The amount in AED the driver must collect from the recipient. Example: 150',
    rule: `Required. More than 0, up to ${MAX_COD_AMOUNT.toLocaleString('en-US')}.`,
    width: 18,
    kind: 'money',
  },
  date: {
    label: 'Delivery Date',
    prompt: `The scheduled delivery date, as YYYY-MM-DD (or DD/MM/YYYY). Bulk shipments are Next Day: from tomorrow up to ${MAX_DAYS_AHEAD} days ahead.`,
    rule: `Required. From tomorrow up to ${MAX_DAYS_AHEAD} days ahead (Next Day delivery).`,
    width: 16,
    kind: 'date',
  },
};

export const TEMPLATE_STEPS = [
  'Choose the Pickup Address in ParcelLink before uploading. It is the same for every shipment in the file.',
  'Go to the Shipments tab. Enter one shipment per row, below the dark row of column names.',
  'Enter the recipient name and phone number, and the delivery address.',
  'Enter what is inside the package, the number of items and the weight in kg.',
  'Enter the COD amount: the cash the driver collects from the recipient, in AED.',
  'Enter the delivery date.',
  'Do not rename, move or delete the column names.',
  'Save the Shipments tab as CSV: Excel › File › Save As › "CSV UTF-8 (Comma delimited)". Google Sheets › File › Download › "Comma-separated values (.csv)".',
  'Upload the CSV in ParcelLink. You will review every shipment before anything is booked.',
];

export const NOT_REQUIRED = [
  ['Pickup Address', 'Chosen once in ParcelLink before you upload. Every shipment in the file uses it.'],
  ['Delivery Type', 'Always Next Day — set automatically.'],
  ['COD Type', 'Every bulk shipment is COD (cash collected from the recipient).'],
  ['Package Value', 'Not needed — the COD amount is what is collected.'],
  ['Delivery Notes, Fragile Status, Pickup Contact', 'Not needed for bulk shipments.'],
  ['Distance, Coverage, Delivery Fee', 'Worked out by ParcelLink when you upload. You review them before booking.'],
];

// ── Workbook XML ────────────────────────────────────────────────────────────

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const columnLetter = (index: number) => String.fromCharCode(65 + index); // A–H is all we need

// Styles (cellXfs indexes, see STYLES_XML).
const S = {
  title: 1,
  note: 2,
  label: 3,
  header: 4,
  dataText: 5,
  dataNumber: 6,
  dataDate: 7,
  exampleLabel: 8,
  example: 9,
  heading: 10,
  body: 11,
  tableHead: 12,
  tableCell: 13,
  code: 14,
  subtitle: 15,
  // Unlocked, unstyled: columns past H, so whole rows can still be deleted
  // on the protected sheet.
  free: 16,
} as const;

const PURPLE = 'FF7B3FA7';
const INK = 'FF1D1A24';
const MUTED = 'FF6B6776';

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>
<fonts count="9">
<font><sz val="11"/><color rgb="${INK}"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="${PURPLE}"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="${MUTED}"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="${INK}"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Consolas"/><family val="3"/></font>
<font><b/><sz val="10"/><color rgb="FF92400E"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="${MUTED}"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="12"/><color rgb="${PURPLE}"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="${INK}"/><name val="Consolas"/><family val="3"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${PURPLE}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3EEF8"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD9D4E0"/></left><right style="thin"><color rgb="FFD9D4E0"/></right><top style="thin"><color rgb="FFD9D4E0"/></top><bottom style="thin"><color rgb="FFD9D4E0"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="17">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
<xf numFmtId="0" fontId="5" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="49" fontId="6" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="8" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyProtection="1"><protection locked="0"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// Shared strings: every text cell refers to one by index.
class Strings {
  private readonly index = new Map<string, number>();
  readonly list: string[] = [];
  ref(text: string) {
    let i = this.index.get(text);
    if (i === undefined) {
      i = this.list.length;
      this.list.push(text);
      this.index.set(text, i);
    }
    return i;
  }
  xml() {
    const items = this.list.map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.list.length}" uniqueCount="${this.list.length}">${items}</sst>`;
  }
}

type Cell = { text?: string; number?: number; style: number };

const rowXml = (strings: Strings, rowNumber: number, cells: Cell[], height?: number) => {
  const attrs = height ? ` ht="${height}" customHeight="1"` : '';
  const body = cells
    .map((cell, i) => {
      const ref = `${columnLetter(i)}${rowNumber}`;
      if (cell.text !== undefined) return `<c r="${ref}" s="${cell.style}" t="s"><v>${strings.ref(cell.text)}</v></c>`;
      if (cell.number !== undefined) return `<c r="${ref}" s="${cell.style}"><v>${cell.number}</v></c>`;
      return `<c r="${ref}" s="${cell.style}"/>`;
    })
    .join('');
  return `<row r="${rowNumber}"${attrs}>${body}</row>`;
};

const WIDTH = MERCHANT_BULK_COLUMNS.length;
const LAST = columnLetter(WIDTH - 1);
// Merged across the 8 data columns, with every cell styled.
const banner = (text: string, style: number): Cell[] => [{ text, style }, ...Array.from({ length: WIDTH - 1 }, () => ({ style }))];

const dataStyle = (kind: ColumnGuide['kind']) => (kind === 'text' ? S.dataText : kind === 'date' ? S.dataDate : S.dataNumber);

// Shipments sheet layout. Rows 1–4 are guidance (skipped by the parser),
// row 5 holds the column names, data starts at row 6.
export const XLSX_HEADER_ROW = 5;
const FIRST_DATA_ROW = XLSX_HEADER_ROW + 1;
const LAST_DATA_ROW = FIRST_DATA_ROW + MERCHANT_BULK_MAX_ROWS - 1;

export const SHIPMENTS_NOTE =
  'One shipment per row, below the dark row of column names — do not rename them. Pickup address: chosen once in ParcelLink. Delivery: always Next Day. Payment: always COD. The yellow row is only an example and is never uploaded. Full guide: "How to use" tab.';

const shipmentsSheet = (strings: Strings, today: string) => {
  const example = templateExample(today);
  const guides = MERCHANT_BULK_COLUMNS.map((column) => COLUMN_GUIDE[column]);
  const rows = [
    rowXml(strings, 1, banner(`${TEMPLATE_TITLE.replace(' - ', ' · ')}`, S.title), 30),
    rowXml(strings, 2, banner(SHIPMENTS_NOTE, S.note), 42),
    rowXml(strings, 3, guides.map((guide) => ({ text: guide.label, style: S.label })), 30),
    rowXml(
      strings,
      4,
      MERCHANT_BULK_COLUMNS.map((column) => ({ text: example[column], style: S.example })),
      18,
    ),
    rowXml(strings, XLSX_HEADER_ROW, MERCHANT_BULK_COLUMNS.map((column) => ({ text: column, style: S.header })), 20),
  ];

  const cols = guides
    .map((guide, i) => `<col min="${i + 1}" max="${i + 1}" width="${guide.width}" style="${dataStyle(guide.kind)}" customWidth="1"/>`)
    .join('')
    .concat(`<col min="${WIDTH + 1}" max="16384" width="9" style="${S.free}"/>`);

  const range = (i: number) => `${columnLetter(i)}${FIRST_DATA_ROW}:${columnLetter(i)}${LAST_DATA_ROW}`;
  const validations = guides.map((guide, i) => {
    const prompt = `showInputMessage="1" promptTitle="${escapeXml(guide.label.slice(0, 32))}" prompt="${escapeXml(guide.prompt.slice(0, 255))}"`;
    const error = (text: string) => `showErrorMessage="1" errorStyle="stop" errorTitle="${escapeXml(guide.label.slice(0, 32))}" error="${escapeXml(text)}"`;
    switch (guide.kind) {
      case 'whole':
        return `<dataValidation type="whole" operator="greaterThanOrEqual" allowBlank="1" ${prompt} ${error('Enter a whole number of 1 or more.')} sqref="${range(i)}"><formula1>1</formula1></dataValidation>`;
      case 'decimal':
        return `<dataValidation type="decimal" operator="greaterThan" allowBlank="1" ${prompt} ${error('Enter a weight in kg greater than 0, for example 2.5.')} sqref="${range(i)}"><formula1>0</formula1></dataValidation>`;
      case 'money':
        return `<dataValidation type="decimal" operator="between" allowBlank="1" ${prompt} ${error(`Enter an amount in AED greater than 0 (up to ${MAX_COD_AMOUNT}).`)} sqref="${range(i)}"><formula1>0.01</formula1><formula2>${MAX_COD_AMOUNT}</formula2></dataValidation>`;
      case 'date':
        return `<dataValidation type="date" operator="between" allowBlank="1" ${prompt} ${error(`Enter a date from tomorrow up to ${MAX_DAYS_AHEAD} days ahead. Bulk shipments are Next Day delivery.`)} sqref="${range(i)}"><formula1>TODAY()+1</formula1><formula2>TODAY()+${MAX_DAYS_AHEAD}</formula2></dataValidation>`;
      default:
        // Guidance only: phone numbers and addresses come in many valid forms.
        return `<dataValidation allowBlank="1" ${prompt} sqref="${range(i)}"/>`;
    }
  });
  validations.push(
    `<dataValidation allowBlank="1" showInputMessage="1" promptTitle="Column name" prompt="ParcelLink reads these column names. Do not rename, move or delete them." sqref="A${XLSX_HEADER_ROW}:${LAST}${XLSX_HEADER_ROW}"/>`,
  );

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><tabColor rgb="${PURPLE}"/></sheetPr>
<dimension ref="A1:${LAST}${XLSX_HEADER_ROW}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="${XLSX_HEADER_ROW}" topLeftCell="A${FIRST_DATA_ROW}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${FIRST_DATA_ROW}" sqref="A${FIRST_DATA_ROW}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rows.join('')}</sheetData>
<sheetProtection sheet="1" objects="1" scenarios="1" formatCells="0" formatColumns="0" formatRows="0" insertRows="0" deleteRows="0" sort="0" autoFilter="0"/>
<mergeCells count="2"><mergeCell ref="A1:${LAST}1"/><mergeCell ref="A2:${LAST}2"/></mergeCells>
<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>
<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
};

// The guide: what to do, what each column means (with an example), and
// what is NOT asked for any more.
const guideSheet = (strings: Strings, today: string) => {
  const example = templateExample(today);
  const rows: string[] = [];
  const merges: string[] = [];
  let r = 0;
  const add = (cells: Cell[], height?: number) => {
    r += 1;
    rows.push(rowXml(strings, r, cells, height));
    return r;
  };
  const wide = (text: string, style: number, height?: number) => {
    const at = add(banner(text, style), height);
    merges.push(`A${at}:${LAST}${at}`);
  };
  const blank = () => {
    r += 1;
  };

  wide('PARCELINK UAE', S.title, 30);
  wide('Merchant Bulk Shipment Template — How to use', S.heading, 20);
  wide('Fill in the Shipments tab, save it as CSV, and upload it in ParcelLink. Everything else is done for you.', S.subtitle, 18);
  blank();

  wide('How to use this file', S.heading, 20);
  TEMPLATE_STEPS.forEach((step, i) => wide(`${i + 1}.  ${step}`, S.body, step.length > 110 ? 30 : 16));
  blank();

  wide('The columns to fill in (all are required)', S.heading, 20);
  // Field guide: name | meaning (merged B–C) | rules (D–F) | example (G–H).
  const guideRow = (cells: [string, string, string, string], styles: [number, number, number, number], height?: number) => {
    const at = add(
      [
        { text: cells[0], style: styles[0] },
        { text: cells[1], style: styles[1] },
        { style: styles[1] },
        { text: cells[2], style: styles[2] },
        { style: styles[2] },
        { style: styles[2] },
        { text: cells[3], style: styles[3] },
        { style: styles[3] },
      ],
      height,
    );
    merges.push(`B${at}:C${at}`, `D${at}:F${at}`, `G${at}:H${at}`);
  };
  guideRow(['Column name (do not change)', 'What to enter', 'Rules', 'Example'], [S.tableHead, S.tableHead, S.tableHead, S.tableHead], 20);
  for (const column of MERCHANT_BULK_COLUMNS) {
    const guide = COLUMN_GUIDE[column];
    guideRow([column, `${guide.label}: ${guide.prompt}`, guide.rule, example[column]], [S.code, S.tableCell, S.tableCell, S.tableCell], 58);
  }
  blank();

  wide('Example — do not upload', S.exampleLabel, 20);
  add(MERCHANT_BULK_COLUMNS.map((column) => ({ text: column, style: S.header })));
  add(MERCHANT_BULK_COLUMNS.map((column) => ({ text: example[column], style: S.example })));
  blank();

  wide('You do not need to enter', S.heading, 20);
  for (const [what, why] of NOT_REQUIRED) {
    const at = add([{ text: what, style: S.tableHead }, { text: why, style: S.tableCell }, ...Array.from({ length: WIDTH - 2 }, () => ({ style: S.tableCell }))], 30);
    merges.push(`B${at}:${LAST}${at}`);
  }
  blank();
  wide('Do not add your own columns: ParcelLink only reads the 8 columns above, and a file with other columns is refused.', S.subtitle, 18);

  const widths = [24, 22, 22, 14, 12, 12, 16, 16];
  const cols = widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><tabColor rgb="FF1A98A2"/></sheetPr>
<dimension ref="A1:${LAST}${r}"/>
<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rows.join('')}</sheetData>
<sheetProtection sheet="1" objects="1" scenarios="1"/>
<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>
<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
};

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets><sheet name="Shipments" sheetId="1" r:id="rId1"/><sheet name="How to use" sheetId="2" r:id="rId2"/></sheets>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>ParcelLink UAE — Merchant Bulk Shipment Template</dc:title>
<dc:creator>ParcelLink UAE</dc:creator>
</cp:coreProperties>`;

// The workbook's parts, by path (also what the tests inspect).
export const merchantTemplateParts = (today: string): Record<string, string> => {
  const strings = new Strings();
  // Sheets first: they fill the shared-string table.
  const sheet1 = shipmentsSheet(strings, today);
  const sheet2 = guideSheet(strings, today);
  return {
    '[Content_Types].xml': CONTENT_TYPES,
    '_rels/.rels': ROOT_RELS,
    'docProps/core.xml': CORE,
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': WORKBOOK_RELS,
    'xl/styles.xml': STYLES_XML,
    'xl/sharedStrings.xml': strings.xml(),
    'xl/worksheets/sheet1.xml': sheet1,
    'xl/worksheets/sheet2.xml': sheet2,
  };
};

// ── ZIP (stored, no compression) ────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

// 2026-01-01 00:00 in DOS format: a fixed stamp keeps the file reproducible.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export const zipStored = (files: Record<string, string>): Uint8Array => {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const [path, content] of Object.entries(files)) {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

export const merchantTemplateXlsx = (today: string) => zipStored(merchantTemplateParts(today));
