// Minimal RFC 4180 CSV parser: quoted fields, escaped quotes (""),
// commas and newlines inside quotes, CRLF or LF line endings, and a UTF-8
// BOM from Excel exports. Kept dependency-free so it's fully unit-tested.
//
// Each record comes with its spreadsheet row number: the 1-based count of
// records up to it, blank ones included (a blank line is a blank row in
// Excel; a newline inside quotes is not a new row). So "row 18" in an error
// is row 18 in the merchant's spreadsheet.
export const parseCsvRecords = (input: string): { cells: string[]; row: number }[] => {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully blank lines (e.g. a trailing newline or spacer rows) —
  // after numbering, so the numbers still match the spreadsheet.
  return rows.map((cells, index) => ({ cells, row: index + 1 })).filter(({ cells }) => cells.some((cell) => cell.trim() !== ''));
};

export const parseCsv = (input: string): string[][] => parseCsvRecords(input).map(({ cells }) => cells);

// Maps rows to objects keyed by a normalized header (trimmed, lowercased).
export const parseCsvWithHeaders = (input: string): { headers: string[]; records: Record<string, string>[] } => {
  const [headerRow, ...dataRows] = parseCsv(input);
  if (!headerRow) return { headers: [], records: [] };

  const headers = headerRow.map((header) => header.trim().toLowerCase());
  const records = dataRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? '').trim()])),
  );

  return { headers, records };
};
