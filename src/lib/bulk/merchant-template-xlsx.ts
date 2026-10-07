// The merchant bulk-shipment template as an Excel workbook (.xlsx): one
// sheet, "Bulk Shipments", with the same 8 machine-readable columns as the
// CSV — a title, a short note, an example row, the column names (each with
// a comment explaining it) and 200 ready-formatted input rows.
//
// Merchants fill the sheet and save it as CSV (the upload accepts CSV
// only). Everything above the column names is guidance — the parser skips
// every line before the header row (findHeaderRow) — so the example can
// never be uploaded as a shipment.
//
// The sheet's checks mirror the upload's (parseMerchantRow and
// bookingSchema), so a row Excel accepts is a row ParcelLink accepts:
// hard errors stop the entry, a non-UAE phone only warns (as the upload
// does), and a half-filled row turns red.
//
// Built here without a library: an .xlsx is a ZIP of XML parts, and this
// one is small and fixed. Runs in the browser (and in tests).

import { MAX_COD_AMOUNT } from '@/lib/pricing/config';
import {
  MAX_DAYS_AHEAD,
  MERCHANT_BULK_COLUMNS,
  MERCHANT_BULK_MAX_ROWS,
  TEMPLATE_EXAMPLE_LABEL,
  TEMPLATE_NOTE,
  TEMPLATE_TITLE,
  templateExample,
} from '@/lib/bulk/merchant-csv';

import type { MerchantBulkColumn } from '@/lib/bulk/merchant-csv';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const SHEET_NAME = 'Bulk Shipments';

// Booking limits (lib/shipment/schemas.ts) the sheet checks as you type.
const NAME_MIN = 2;
const NAME_MAX = 120;
const TEXT_MAX = 300;
const QUANTITY_MAX = 1000;
const WEIGHT_MAX = 1000;
// Weight and cod_amount show 2 decimals, and a CSV saves what is shown:
// anything under 0.01 would upload as 0, which both refuse.
const NUMBER_MIN = 0.01;

// ── What each column means ──────────────────────────────────────────────────

type Kind = 'text' | 'wrap' | 'whole' | 'weight' | 'money' | 'date';

type ColumnGuide = {
  // The header's comment.
  note: string;
  width: number;
  kind: Kind;
};

const formatAed = (amount: number) => amount.toLocaleString('en-US');

export const columnGuide = (today: string): Record<MerchantBulkColumn, ColumnGuide> => {
  const tomorrow = templateExample(today).date;
  return {
    recipient_name: { note: 'Full name of the person receiving the parcel.', width: 24, kind: 'text' },
    recipient_phone: {
      note: 'UAE number, e.g. +971501234567 or 0501234567. Cell is text-formatted so the + and leading 0 are kept.',
      width: 21,
      kind: 'text',
    },
    delivery_address: { note: 'Building / street, area, emirate.', width: 46, kind: 'wrap' },
    package_description: { note: 'Short description of the contents.', width: 28, kind: 'text' },
    quantity: { note: `Number of items. Whole number, 1 to ${QUANTITY_MAX}.`, width: 11, kind: 'whole' },
    weight_kg: { note: 'Total weight in kilograms, e.g. 2.5. More than 0.', width: 13, kind: 'weight' },
    cod_amount: {
      note: `Cash the driver collects from the recipient (AED). Required: more than 0, up to ${formatAed(MAX_COD_AMOUNT)}. Every bulk shipment is COD.`,
      width: 15,
      kind: 'money',
    },
    date: {
      note: `Delivery date, from tomorrow up to ${MAX_DAYS_AHEAD} days ahead. Format YYYY-MM-DD, e.g. ${tomorrow} (DD/MM/YYYY also works).`,
      width: 14,
      kind: 'date',
    },
  };
};

// Row 2: the CSV note, plus how to get the sheet into ParcelLink.
export const SHEET_NOTE = `${TEMPLATE_NOTE} When done: save this sheet as "CSV UTF-8" and upload the CSV.`;

// ── Workbook XML ────────────────────────────────────────────────────────────

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const columnLetter = (index: number) => String.fromCharCode(65 + index); // A–H is all we need

const NAVY = 'FF14213D';
const NAVY2 = 'FF1F3A5F';
const AMBER = 'FFF59E0B';
const LINE = 'FFB8C4D6';

// Column kinds, in the order their styles repeat within each block below.
const KINDS: Kind[] = ['text', 'wrap', 'whole', 'weight', 'money', 'date'];
// numFmtId (built-in: 49 "@", 1 "0", 2 "0.00", 4 "#,##0.00") and alignment per kind.
const KIND_XF: Record<Kind, { numFmt: number; align: string }> = {
  text: { numFmt: 49, align: '<alignment horizontal="left" vertical="center" indent="1"/>' },
  wrap: { numFmt: 49, align: '<alignment horizontal="left" vertical="center" indent="1" wrapText="1"/>' },
  whole: { numFmt: 1, align: '<alignment horizontal="center" vertical="center"/>' },
  weight: { numFmt: 2, align: '<alignment horizontal="right" vertical="center" indent="1"/>' },
  money: { numFmt: 4, align: '<alignment horizontal="right" vertical="center" indent="1"/>' },
  date: { numFmt: 49, align: '<alignment horizontal="center" vertical="center"/>' },
};

// Styles (cellXfs indexes, see STYLES_XML). Example, white and zebra rows
// are blocks of one style per kind: S.example + KINDS.indexOf(kind).
const S = { title: 1, note: 2, label: 3, header: 4, example: 5, white: 11, zebra: 17 } as const;

const kindXfs = (fontId: number, fillId: number) =>
  KINDS.map(
    (kind) =>
      `<xf numFmtId="${KIND_XF[kind].numFmt}" fontId="${fontId}" fillId="${fillId}" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${KIND_XF[kind].align}</xf>`,
  ).join('');

const font = (attrs: string, size: number, color: string) => `<font>${attrs}<sz val="${size}"/><color rgb="${color}"/><name val="Arial"/><family val="2"/></font>`;
const solid = (color: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`;
const thin = (side: string) => `<${side} style="thin"><color rgb="${LINE}"/></${side}>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="6">
${font('', 10, 'FF000000')}
${font('<b/>', 16, 'FFFFFFFF')}
${font('', 10, 'FF1F2937')}
${font('<b/>', 10, 'FF92400E')}
${font('<i/>', 10, 'FF7C5E10')}
${font('<b/>', 11, 'FFFFFFFF')}
</fonts>
<fills count="9">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
${solid(NAVY)}
${solid('FFE8EEF7')}
${solid('FFFDE8B0')}
${solid('FFFFF4D6')}
${solid(NAVY2)}
${solid('FFFFFFFF')}
${solid('FFF2F5FA')}
</fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border>${thin('left')}${thin('right')}${thin('top')}${thin('bottom')}<diagonal/></border>
<border><left/><right/><top/><bottom style="thick"><color rgb="${AMBER}"/></bottom><diagonal/></border>
<border>${thin('left')}${thin('right')}${thin('top')}<bottom style="medium"><color rgb="${AMBER}"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="23">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="6" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
${kindXfs(4, 5)}
${kindXfs(0, 7)}
${kindXfs(0, 8)}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="1"><dxf><fill><patternFill patternType="solid"><bgColor rgb="FFFDE2E2"/></patternFill></fill></dxf></dxfs>
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

const rowXml = (strings: Strings, rowNumber: number, cells: Cell[], height: number) => {
  const body = cells
    .map((cell, i) => {
      const ref = `${columnLetter(i)}${rowNumber}`;
      if (cell.text !== undefined) return `<c r="${ref}" s="${cell.style}" t="s"><v>${strings.ref(cell.text)}</v></c>`;
      if (cell.number !== undefined) return `<c r="${ref}" s="${cell.style}"><v>${cell.number}</v></c>`;
      return `<c r="${ref}" s="${cell.style}"/>`;
    })
    .join('');
  return `<row r="${rowNumber}" ht="${height}" customHeight="1">${body}</row>`;
};

const WIDTH = MERCHANT_BULK_COLUMNS.length;
const LAST = columnLetter(WIDTH - 1);
// Merged across the 8 data columns, with every cell styled.
const banner = (text: string, style: number): Cell[] => [{ text, style }, ...Array.from({ length: WIDTH - 1 }, () => ({ style }))];

// Rows 1–4 are guidance (skipped by the parser), row 5 holds the column
// names, data starts at row 6. 200 rows are formatted ready to fill; the
// checks cover every row the upload accepts.
export const XLSX_HEADER_ROW = 5;
const FIRST_DATA_ROW = XLSX_HEADER_ROW + 1;
const LAST_STYLED_ROW = FIRST_DATA_ROW + 200 - 1;
const LAST_DATA_ROW = FIRST_DATA_ROW + MERCHANT_BULK_MAX_ROWS - 1;

// The upload's UAE phone rule (isUaePhone), as a spreadsheet formula: with
// spaces, dashes, brackets and "+" removed, the number's leading digits
// must be 0 (or 971 / 00971) then a landline area code 2–9 (8 digits) or
// a mobile 5x (9 digits).
const phoneRule = (cell: string) => {
  const digits = ['" "', '"-"', '"+"', '"("', '")"'].reduce((inner, ch) => `SUBSTITUTE(${inner},${ch},"")`, cell);
  return `ISNUMBER(FIND(SUBSTITUTE("|"&INT(${digits}/1E7)&"|","|971","|"),"|2|3|4|5|6|7|8|9|50|51|52|53|54|55|56|57|58|59|"))`;
};

// The upload's date rule: YYYY-MM-DD or DD/MM/YYYY, from tomorrow up to
// MAX_DAYS_AHEAD days ahead.
const dateRule = (cell: string) => {
  const date = `IF(MID(${cell},5,1)="-",DATE(LEFT(${cell},4),MID(${cell},6,2),RIGHT(${cell},2)),DATE(RIGHT(${cell},4),MID(${cell},4,2),LEFT(${cell},2)))`;
  const middle = (MAX_DAYS_AHEAD + 1) / 2;
  return `AND(LEN(${cell})=10,ABS(${date}-TODAY()-${middle})<=${middle - 1})`;
};

// Every validation formula (Excel refuses ones over 255 characters).
export const validationFormulas = () => [phoneRule(`B${FIRST_DATA_ROW}`), dateRule(`H${FIRST_DATA_ROW}`)];

const shipmentsSheet = (strings: Strings, today: string) => {
  const example = templateExample(today);
  const guides = MERCHANT_BULK_COLUMNS.map((column) => columnGuide(today)[column]);
  const kindAt = (i: number) => KINDS.indexOf(guides[i].kind);

  const rows = [
    rowXml(strings, 1, banner(TEMPLATE_TITLE, S.title), 34),
    rowXml(strings, 2, banner(SHEET_NOTE, S.note), 44),
    rowXml(strings, 3, banner(TEMPLATE_EXAMPLE_LABEL, S.label), 22),
    rowXml(
      strings,
      4,
      MERCHANT_BULK_COLUMNS.map((column, i) => {
        const style = S.example + kindAt(i);
        return guides[i].kind === 'text' || guides[i].kind === 'wrap' || guides[i].kind === 'date'
          ? { text: example[column], style }
          : { number: Number(example[column]), style };
      }),
      24,
    ),
    rowXml(strings, XLSX_HEADER_ROW, MERCHANT_BULK_COLUMNS.map((column) => ({ text: column, style: S.header })), 28),
  ];
  for (let r = FIRST_DATA_ROW; r <= LAST_STYLED_ROW; r += 1) {
    const base = (r - FIRST_DATA_ROW) % 2 === 0 ? S.white : S.zebra;
    rows.push(rowXml(strings, r, guides.map((_, i) => ({ style: base + kindAt(i) })), 22));
  }

  const cols = guides
    .map((guide, i) => `<col min="${i + 1}" max="${i + 1}" width="${guide.width}" customWidth="1"/>`)
    .join('');

  const range = (column: string) => `${column}${FIRST_DATA_ROW}:${column}${LAST_DATA_ROW}`;
  const validation = (column: string, attrs: string, title: string, message: string, formulas: (string | number)[], style = 'stop') =>
    `<dataValidation ${attrs} errorStyle="${style}" allowBlank="1" showErrorMessage="1" errorTitle="${escapeXml(title)}" error="${escapeXml(message)}" sqref="${range(column)}">${formulas
      .map((formula, i) => `<formula${i + 1}>${escapeXml(String(formula))}</formula${i + 1}>`)
      .join('')}</dataValidation>`;
  const validations = [
    validation('A', 'type="textLength" operator="between"', 'Recipient name', `Enter the recipient's full name (${NAME_MIN} to ${NAME_MAX} characters).`, [NAME_MIN, NAME_MAX]),
    validation(
      'B',
      'type="custom"',
      'Phone',
      'Use a UAE number, e.g. +971501234567 or 0501234567. Other numbers are accepted but flagged, as the driver may not be able to call them.',
      [phoneRule(`B${FIRST_DATA_ROW}`)],
      'warning',
    ),
    validation('C', 'type="textLength" operator="between"', 'Delivery address', `Enter the delivery address (up to ${TEXT_MAX} characters).`, [1, TEXT_MAX]),
    validation('D', 'type="textLength" operator="between"', 'Package description', `Describe the contents (up to ${TEXT_MAX} characters).`, [1, TEXT_MAX]),
    validation('E', 'type="whole" operator="between"', 'Quantity', `Enter a whole number from 1 to ${QUANTITY_MAX}.`, [1, QUANTITY_MAX]),
    validation('F', 'type="decimal" operator="between"', 'Weight', `Enter the weight in kg as a number above 0 (up to ${WEIGHT_MAX}).`, [NUMBER_MIN, WEIGHT_MAX]),
    validation(
      'G',
      'type="decimal" operator="between"',
      'COD amount',
      `Enter the cash to collect in AED: more than 0, up to ${formatAed(MAX_COD_AMOUNT)}. Every bulk shipment is cash on delivery.`,
      [NUMBER_MIN, MAX_COD_AMOUNT],
    ),
    validation(
      'H',
      'type="custom"',
      'Date',
      `Enter a date from tomorrow up to ${MAX_DAYS_AHEAD} days ahead, as YYYY-MM-DD (e.g. ${example.date}) or DD/MM/YYYY. Bulk shipments are Next Day.`,
      [dateRule(`H${FIRST_DATA_ROW}`)],
    ),
  ];

  const data = `A${FIRST_DATA_ROW}:${LAST}${LAST_DATA_ROW}`;
  const halfFilled = `AND(COUNTA($A${FIRST_DATA_ROW}:$${LAST}${FIRST_DATA_ROW})&gt;0,COUNTA($A${FIRST_DATA_ROW}:$${LAST}${FIRST_DATA_ROW})&lt;${WIDTH})`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><tabColor rgb="${NAVY2}"/><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${LAST}${LAST_STYLED_ROW}"/>
<sheetViews><sheetView showGridLines="0" tabSelected="1" workbookViewId="0"><pane ySplit="${XLSX_HEADER_ROW}" topLeftCell="A${FIRST_DATA_ROW}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${FIRST_DATA_ROW}" sqref="A${FIRST_DATA_ROW}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rows.join('')}</sheetData>
<autoFilter ref="A${XLSX_HEADER_ROW}:${LAST}${LAST_DATA_ROW}"/>
<mergeCells count="3"><mergeCell ref="A1:${LAST}1"/><mergeCell ref="A2:${LAST}2"/><mergeCell ref="A3:${LAST}3"/></mergeCells>
<conditionalFormatting sqref="${data}"><cfRule type="expression" dxfId="0" priority="1"><formula>${halfFilled}</formula></cfRule></conditionalFormatting>
<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>
<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
<legacyDrawing r:id="rId2"/>
</worksheet>`;
};

// The column names' comments (Excel shows them on hover).
const commentsXml = (today: string) => {
  const guide = columnGuide(today);
  const list = MERCHANT_BULK_COLUMNS.map(
    (column, i) =>
      `<comment ref="${columnLetter(i)}${XLSX_HEADER_ROW}" authorId="0"><text><r><rPr><sz val="9"/><color rgb="FF000000"/><rFont val="Arial"/><family val="2"/></rPr><t xml:space="preserve">${escapeXml(guide[column].note)}</t></r></text></comment>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>ParcelLink</author></authors><commentList>${list}</commentList></comments>`;
};

// The comments' boxes (legacy VML, which Excel still requires): 260×70 px.
const vmlXml = () => {
  const shapes = MERCHANT_BULK_COLUMNS.map((_, i) => {
    const row = XLSX_HEADER_ROW - 1; // zero-based
    return `<v:shape id="_x0000_s${1025 + i}" type="#_x0000_t202" style="position:absolute;margin-left:0;margin-top:0;width:195pt;height:52.5pt;z-index:${i + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${i + 1}, 15, ${row}, 10, ${i + 3}, 15, ${row + 4}, 4</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${row}</x:Row><x:Column>${i}</x:Column></x:ClientData></v:shape>`;
  }).join('');
  return `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>${shapes}</xml>`;
};

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const SHEET_REF = `'${SHEET_NAME}'`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets><sheet name="${SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${SHEET_REF}!$A$${XLSX_HEADER_ROW}:$${LAST}$${LAST_DATA_ROW}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">${SHEET_REF}!$1:$${XLSX_HEADER_ROW}</definedName></definedNames>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

const SHEET_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/>
</Relationships>`;

const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${TEMPLATE_TITLE}</dc:title>
<dc:creator>ParcelLink</dc:creator>
</cp:coreProperties>`;

// The workbook's parts, by path (also what the tests inspect).
export const merchantTemplateParts = (today: string): Record<string, string> => {
  const strings = new Strings();
  // The sheet first: it fills the shared-string table.
  const sheet1 = shipmentsSheet(strings, today);
  return {
    '[Content_Types].xml': CONTENT_TYPES,
    '_rels/.rels': ROOT_RELS,
    'docProps/core.xml': CORE,
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': WORKBOOK_RELS,
    'xl/styles.xml': STYLES_XML,
    'xl/sharedStrings.xml': strings.xml(),
    'xl/worksheets/sheet1.xml': sheet1,
    'xl/worksheets/_rels/sheet1.xml.rels': SHEET_RELS,
    'xl/comments1.xml': commentsXml(today),
    'xl/drawings/vmlDrawing1.vml': vmlXml(),
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
