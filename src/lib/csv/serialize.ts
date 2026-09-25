// Spreadsheet apps execute cells starting with these characters as
// formulas ("CSV injection"). User-controlled text such as a customer name
// like =HYPERLINK(...) must never reach an export unescaped — prefixing
// with a single quote makes Excel/Sheets treat it as literal text.
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

export const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';

  let text = typeof value === 'number' || typeof value === 'boolean' ? String(value) : String(value);

  // Plain numbers (including negatives) are data, not formulas.
  const isNumeric = typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(text);
  if (!isNumeric && FORMULA_TRIGGERS.some((trigger) => text.startsWith(trigger))) {
    text = `'${text}`;
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const toCsv = (headers: string[], rows: unknown[][]): string => {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
};
