import { describe, expect, it } from 'vitest';

import { parseCsv, parseCsvWithHeaders } from '@/lib/csv/parse';
import { escapeCsvCell, toCsv } from '@/lib/csv/serialize';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted commas, escaped quotes and embedded newlines', () => {
    const input = 'name,note\n"Smith, J","He said ""hi""\nthen left"';
    expect(parseCsv(input)).toEqual([
      ['name', 'note'],
      ['Smith, J', 'He said "hi"\nthen left'],
    ]);
  });

  it('handles CRLF line endings, a BOM, and blank lines', () => {
    expect(parseCsv('\uFEFFa,b\r\n1,2\r\n\r\n3,4\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });
});

describe('parseCsvWithHeaders', () => {
  it('normalizes headers and trims values', () => {
    const { headers, records } = parseCsvWithHeaders(' Pickup_Address ,Quantity\n Dubai Marina , 2 ');
    expect(headers).toEqual(['pickup_address', 'quantity']);
    expect(records).toEqual([{ pickup_address: 'Dubai Marina', quantity: '2' }]);
  });

  it('fills missing trailing cells with empty strings', () => {
    const { records } = parseCsvWithHeaders('a,b,c\n1');
    expect(records[0]).toEqual({ a: '1', b: '', c: '' });
  });
});

describe('escapeCsvCell', () => {
  it.each(['=HYPERLINK("http://evil")', '+1+1', '@SUM(A1)', '-2+3'])('neutralizes formula %s', (value) => {
    expect(escapeCsvCell(value).replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('leaves plain numbers (including negatives) untouched', () => {
    expect(escapeCsvCell(-12.5)).toBe('-12.5');
    expect(escapeCsvCell('-12.5')).toBe('-12.5');
    expect(escapeCsvCell(21.6)).toBe('21.6');
  });

  it('quotes cells containing commas, quotes or newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('renders null/undefined as empty', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});

describe('toCsv', () => {
  it('round-trips through parseCsv', () => {
    const csv = toCsv(['name', 'amount'], [
      ['Smith, J', 12],
      ['Line\nbreak', 3.5],
    ]);
    expect(parseCsv(csv)).toEqual([
      ['name', 'amount'],
      ['Smith, J', '12'],
      ['Line\nbreak', '3.5'],
    ]);
  });
});
