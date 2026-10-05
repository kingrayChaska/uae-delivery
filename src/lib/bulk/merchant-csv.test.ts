import { describe, expect, it } from 'vitest';

import { parseCsv, parseCsvRecords, parseCsvWithHeaders } from '@/lib/csv/parse';
import {
  MERCHANT_BULK_COLUMNS,
  MERCHANT_BULK_FIXED,
  MERCHANT_BULK_MAX_ROWS,
  cleanCell,
  fieldForBookingPath,
  isBookableStatus,
  isUaePhone,
  merchantHeaderError,
  merchantTemplateCsv,
  missingMerchantColumns,
  normalizedRowKey,
  parseCsvDate,
  parseMerchantRow,
  readMerchantTable,
  rowStatusFor,
  templateExample,
  toMerchantRowInput,
} from '@/lib/bulk/merchant-csv';
import { parseMsg } from '@/i18n/message';
import { classifyServiceArea } from '@/lib/service-areas/config';
import { isTooGeneral, parseForwardGeocodeLocation } from '@/lib/maps/google-client';
import { calculateShipmentPrice } from '@/lib/pricing/calculate';
import { DEFAULT_PRICING_RULES } from '@/lib/pricing/config';

import type { MerchantRowInput } from '@/lib/bulk/merchant-csv';

const TODAY = '2026-10-05';
const TOMORROW = '2026-10-06';

const CANONICAL_HEADER = 'recipient_name,recipient_phone,delivery_address,package_description,quantity,weight_kg,cod_amount,date';

// The client's own example file.
const CLIENT_CSV = `${CANONICAL_HEADER}
Ahmed Ali,+971501234567,Dubai Marina,Electronics,1,2.5,150,2026-10-06
Fatima Hassan,+971521234567,Jumeirah,Cosmetics,2,1.5,200,2026-10-06
`;

// The previous 17-column template.
const OLD_HEADER =
  'recipient_name,recipient_phone,pickup_address,delivery_address,package_description,quantity,weight_kg,package_value,delivery_date,cod_type,cod_amount,notes,delivery_type,package_type,fragile,pickup_contact_name,pickup_contact_phone';

const row = (overrides: Partial<MerchantRowInput> = {}): MerchantRowInput => ({ ...templateExample(TODAY), ...overrides });

const fields = (input: MerchantRowInput) => parseMerchantRow(input, TODAY).issues.map((issue) => `${issue.severity}:${issue.field}`);

const table = (csv: string) => readMerchantTable(parseCsvRecords(csv));
const errorKey = (csv: string) => {
  const result = table(csv);
  return 'error' in result ? parseMsg(result.error)?.key : null;
};

describe('merchant CSV columns', () => {
  it('is exactly the 8 canonical columns, in order', () => {
    expect(MERCHANT_BULK_COLUMNS.join(',')).toBe(CANONICAL_HEADER);
  });

  it('fixes Next Day and COD for every bulk shipment', () => {
    expect(MERCHANT_BULK_FIXED).toEqual({ deliveryType: 'next_day', recipientPaymentType: 'postpaid', packageType: 'parcel', isFragile: false });
  });
});

describe('merchant CSV template', () => {
  it('has guidance, an example above the header, and the canonical header last', () => {
    const csv = merchantTemplateCsv(TODAY);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = parseCsv(csv);
    expect(lines.at(-1)).toEqual([...MERCHANT_BULK_COLUMNS]);
    // No removed column appears anywhere in the file.
    for (const legacy of ['pickup_address', 'delivery_date', 'cod_type', 'package_value', 'notes', 'fragile', 'delivery_type', 'pickup_contact']) {
      expect(csv).not.toContain(legacy);
    }
  });

  it('never uploads its example: the blank template has no shipments', () => {
    expect(errorKey(merchantTemplateCsv(TODAY))).toBe('bulk.errors.empty');
  });

  it('round-trips: rows typed under the template header are read, the guidance is skipped', () => {
    const filled = `${merchantTemplateCsv(TODAY)}Sara Khan,0501112233,"Villa 12, Al Barsha 2, Dubai",Clothes,3,1.2,99.5,${TOMORROW}\r\n`;
    const result = table(filled);
    if ('error' in result) throw new Error(result.error);
    expect(result.rows).toHaveLength(1);
    // Row numbers match the spreadsheet (5 guidance/header lines first).
    expect(result.rows[0].row).toBe(6);
    const input = toMerchantRowInput(Object.fromEntries(result.headers.map((h, i) => [h, result.rows[0].cells[i] ?? ''])));
    const { row: parsed, issues } = parseMerchantRow(input, TODAY);
    expect(issues).toEqual([]);
    expect(parsed).toMatchObject({ recipientName: 'Sara Khan', deliveryAddress: 'Villa 12, Al Barsha 2, Dubai', codAmount: 99.5, deliveryDate: TOMORROW });
  });

  it("the template's example row is itself valid", () => {
    expect(parseMerchantRow(templateExample(TODAY), TODAY).issues).toEqual([]);
    expect(templateExample(TODAY).date).toBe(TOMORROW);
  });
});

describe('reading a merchant file', () => {
  it("parses the client's example file", () => {
    const result = table(CLIENT_CSV);
    if ('error' in result) throw new Error(result.error);
    expect(result.headers).toEqual([...MERCHANT_BULK_COLUMNS]);
    expect(result.rows).toHaveLength(2);
    const parsed = result.rows.map(({ cells }) =>
      parseMerchantRow(toMerchantRowInput(Object.fromEntries(result.headers.map((h, i) => [h, cells[i] ?? '']))), TODAY),
    );
    expect(parsed.map((p) => p.issues)).toEqual([[], []]);
    expect(parsed.map((p) => p.row)).toEqual([
      {
        recipientName: 'Ahmed Ali',
        recipientPhone: '+971501234567',
        deliveryAddress: 'Dubai Marina',
        packageDescription: 'Electronics',
        quantity: 1,
        weightKg: 2.5,
        codAmount: 150,
        deliveryDate: '2026-10-06',
      },
      {
        recipientName: 'Fatima Hassan',
        recipientPhone: '+971521234567',
        deliveryAddress: 'Jumeirah',
        packageDescription: 'Cosmetics',
        quantity: 2,
        weightKg: 1.5,
        codAmount: 200,
        deliveryDate: '2026-10-06',
      },
    ]);
  });

  it('normalizes header case and spacing', () => {
    expect('error' in table(`${CANONICAL_HEADER.toUpperCase().replace(/,/g, ' , ')}\nA,0501234567,Marina,Box,1,1,10,${TOMORROW}`)).toBe(false);
  });

  it('refuses the old 17-column template as outdated', () => {
    expect(errorKey(`${OLD_HEADER}\nAhmed,0501234567,Business Bay,Marina,Box,1,1,,${TOMORROW},Postpaid,10,,,,,,`)).toBe('bulk.errors.outdatedTemplate');
  });

  it('refuses any removed column, even alongside the new ones', () => {
    for (const removed of ['delivery_date', 'pickup_address', 'cod_type', 'package_value', 'notes', 'fragile', 'delivery_type', 'pickup_contact_name', 'delivery_fee']) {
      expect(merchantHeaderError([...MERCHANT_BULK_COLUMNS, removed])).toMatch(/^bulk\.errors\.outdatedTemplate/);
    }
    // An old file that renamed date → delivery_date is outdated, not just "missing date".
    expect(merchantHeaderError(MERCHANT_BULK_COLUMNS.map((c) => (c === 'date' ? 'delivery_date' : c)))).toMatch(/^bulk\.errors\.outdatedTemplate/);
  });

  it('reports missing, unknown and repeated columns', () => {
    expect(missingMerchantColumns(['recipient_name', 'delivery_address'])).toEqual([
      'recipient_phone',
      'package_description',
      'quantity',
      'weight_kg',
      'cod_amount',
      'date',
    ]);
    expect(merchantHeaderError(['recipient_name'])).toMatch(/^bulk\.errors\.missingColumns/);
    expect(merchantHeaderError([...MERCHANT_BULK_COLUMNS, 'order_id'])).toMatch(/^bulk\.errors\.unknownColumns/);
    expect(merchantHeaderError([...MERCHANT_BULK_COLUMNS, 'quantity'])).toMatch(/^bulk\.errors\.repeatedColumns/);
    expect(merchantHeaderError([...MERCHANT_BULK_COLUMNS])).toBeNull();
  });

  it('refuses empty files and files over the row limit', () => {
    expect(errorKey('')).toBe('bulk.errors.empty');
    expect(errorKey(`${CANONICAL_HEADER}\n`)).toBe('bulk.errors.empty');
    const body = Array.from({ length: MERCHANT_BULK_MAX_ROWS + 1 }, (_, i) => `N${i},0501234567,Marina,Box,1,1,10,${TOMORROW}`).join('\n');
    expect(errorKey(`${CANONICAL_HEADER}\n${body}`)).toBe('bulk.errors.tooMany');
  });
});

describe('CSV parsing of merchant files', () => {
  it('keeps commas inside quoted addresses, BOM and CRLF', () => {
    const csv = '﻿recipient_name,delivery_address\r\n"Ali, Jr.","Office 1203, Bay Square, Business Bay, Dubai"\r\n';
    const { headers, records } = parseCsvWithHeaders(csv);
    expect(headers).toEqual(['recipient_name', 'delivery_address']);
    expect(records[0]).toEqual({ recipient_name: 'Ali, Jr.', delivery_address: 'Office 1203, Bay Square, Business Bay, Dubai' });
  });

  it('handles empty values, escaped quotes and blank lines', () => {
    expect(parseCsv('a,b,c\n1,,"say ""hi"""\n\n2,x,\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', 'say "hi"'],
      ['2', 'x', ''],
    ]);
  });

  it('numbers records as spreadsheet rows: blank rows count, quoted newlines do not', () => {
    const csv = 'name,address\n\nAli,"Line 1\nLine 2"\n\n\nSara,Marina\n';
    expect(parseCsvRecords(csv)).toEqual([
      { cells: ['name', 'address'], row: 1 },
      { cells: ['Ali', 'Line 1\nLine 2'], row: 3 },
      { cells: ['Sara', 'Marina'], row: 6 },
    ]);
  });

  it('strips control characters and keeps formula-looking text as plain text', () => {
    expect(cleanCell('  Ahmed\u0000 Ali\u0007 ')).toBe('Ahmed Ali');
    // Stored and shown as text; exports escape it (lib/csv/serialize).
    expect(cleanCell('=HYPERLINK("x")')).toBe('=HYPERLINK("x")');
    // The export escape is undone, so a downloaded value reads back as written.
    expect(cleanCell("'+971501234567")).toBe('+971501234567');
    expect(cleanCell("O'Brien")).toBe("O'Brien");
  });

  it('treats rows differing only in case and spacing as duplicates', () => {
    const a = row({ recipient_name: 'Ahmed  Ali' });
    const b = row({ recipient_name: 'ahmed ali' });
    expect(normalizedRowKey(a)).toBe(normalizedRowKey(b));
    expect(normalizedRowKey(a)).not.toBe(normalizedRowKey(row({ recipient_name: 'Sara' })));
  });
});

describe('merchant row validation', () => {
  it('requires all 8 columns', () => {
    const empty = Object.fromEntries(MERCHANT_BULK_COLUMNS.map((c) => [c, ''])) as MerchantRowInput;
    expect(fields(empty)).toEqual([
      'error:recipient_name',
      'error:recipient_phone',
      'error:delivery_address',
      'error:package_description',
      'error:quantity',
      'error:weight_kg',
      'error:cod_amount',
      'error:date',
    ]);
  });

  it('flags each missing field on its own', () => {
    expect(fields(row({ recipient_name: '' }))).toEqual(['error:recipient_name']);
    expect(fields(row({ recipient_phone: '' }))).toEqual(['error:recipient_phone']);
    expect(fields(row({ delivery_address: '' }))).toEqual(['error:delivery_address']);
    expect(fields(row({ weight_kg: '' }))).toEqual(['error:weight_kg']);
    expect(fields(row({ date: '' }))).toEqual(['error:date']);
  });

  it('checks quantity and weight', () => {
    expect(fields(row({ quantity: '0' }))).toEqual(['error:quantity']);
    expect(fields(row({ quantity: '1.5' }))).toEqual(['error:quantity']);
    expect(fields(row({ quantity: 'two' }))).toEqual(['error:quantity']);
    expect(fields(row({ weight_kg: '0' }))).toEqual(['error:weight_kg']);
    expect(fields(row({ weight_kg: '-1' }))).toEqual(['error:weight_kg']);
    expect(fields(row({ weight_kg: 'heavy' }))).toEqual(['error:weight_kg']);
  });

  it('requires a COD amount above 0 and within the maximum', () => {
    expect(fields(row({ cod_amount: '' }))).toEqual(['error:cod_amount']);
    expect(fields(row({ cod_amount: '0' }))).toEqual(['error:cod_amount']);
    expect(fields(row({ cod_amount: '-20' }))).toEqual(['error:cod_amount']);
    expect(fields(row({ cod_amount: 'lots' }))).toEqual(['error:cod_amount']);
    expect(fields(row({ cod_amount: '100001' }))).toEqual(['error:cod_amount']);
    expect(parseMerchantRow(row({ cod_amount: 'AED 1,250.50' }), TODAY).row?.codAmount).toBe(1250.5);
  });

  it('validates phone numbers: UAE formats pass, others are only a warning', () => {
    for (const phone of ['+971501234567', '0501234567', '00971 50 123 4567', '042345678', '+971 4 234 5678']) {
      expect(isUaePhone(phone)).toBe(true);
    }
    const { row: parsed, issues } = parseMerchantRow(row({ recipient_phone: '+447911123456' }), TODAY);
    expect(parsed).not.toBeNull();
    expect(issues.map((i) => `${i.severity}:${i.field}`)).toEqual(['warning:recipient_phone']);
    expect(rowStatusFor(issues)).toBe('warning');
  });

  it('validates the date as a Next Day delivery date', () => {
    expect(parseCsvDate('2026-10-06')).toBe('2026-10-06');
    expect(parseCsvDate('06/10/2026')).toBe('2026-10-06');
    expect(parseCsvDate('2026-02-30')).toBeNull();
    expect(parseMerchantRow(row({ date: '06/10/2026' }), TODAY).row?.deliveryDate).toBe(TOMORROW);
    // Same-day is never possible through the bulk CSV.
    expect(parseMerchantRow(row({ date: TODAY }), TODAY).issues.map((i) => parseMsg(i.message)?.key)).toEqual(['bulk.validation.nextDayToday']);
    expect(fields(row({ date: '2026-10-01' }))).toEqual(['error:date']);
    expect(fields(row({ date: '2027-06-01' }))).toEqual(['error:date']);
    expect(fields(row({ date: 'tomorrow' }))).toEqual(['error:date']);
  });

  it('ignores anything a row says about the fixed values', () => {
    const tampered = { ...row(), delivery_type: 'same_day', cod_type: 'Prepaid', pickup_address: 'Elsewhere' } as MerchantRowInput;
    const input = toMerchantRowInput(tampered as unknown as Record<string, string>);
    expect(Object.keys(input)).toEqual([...MERCHANT_BULK_COLUMNS]);
    expect(Object.keys(parseMerchantRow(input, TODAY).row ?? {})).not.toContain('deliveryType');
  });

  it('maps booking-schema paths back to template fields', () => {
    expect(fieldForBookingPath(['dropoff', 'contactPhone'])).toBe('recipient_phone');
    expect(fieldForBookingPath(['pickup', 'address'])).toBe('pickup_address');
    expect(fieldForBookingPath(['codAmount'])).toBe('cod_amount');
    expect(fieldForBookingPath(['somethingElse'])).toBe('row');
  });

  it('books valid and warning rows only', () => {
    expect(['valid', 'warning', 'invalid', 'pending'].map((s) => isBookableStatus(s as never))).toEqual([true, true, false, false]);
  });
});

describe('server-side address resolution (forward geocoding)', () => {
  const result = (types: string[], extra: Record<string, unknown> = {}) => ({
    status: 'OK',
    results: [
      {
        place_id: 'ChIJ-dubai-mall',
        formatted_address: 'Dubai Mall - Downtown Dubai - Dubai - United Arab Emirates',
        types,
        geometry: { location: { lat: 25.1972, lng: 55.2796 } },
        address_components: [
          { long_name: 'Downtown Dubai', short_name: 'Downtown Dubai', types: ['neighborhood', 'political'] },
          { long_name: 'Dubai', short_name: 'Dubai', types: ['locality', 'political'] },
          { long_name: 'Dubai', short_name: 'Dubai', types: ['administrative_area_level_1', 'political'] },
          { long_name: 'United Arab Emirates', short_name: 'AE', types: ['country', 'political'] },
        ],
        ...extra,
      },
    ],
  });

  it('keeps the Place ID and the emirate, so coverage comes from Google components', () => {
    const parsed = parseForwardGeocodeLocation(result(['establishment', 'point_of_interest']));
    expect(parsed?.location.place.placeId).toBe('ChIJ-dubai-mall');
    expect(classifyServiceArea(parsed!.location.place)).toEqual({ status: 'active', emirate: 'Dubai' });
  });

  it('flags partial matches and city-only results', () => {
    expect(parseForwardGeocodeLocation(result(['route'], { partial_match: true }))?.partialMatch).toBe(true);
    expect(isTooGeneral(['locality', 'political'])).toBe(true);
    expect(isTooGeneral(['neighborhood', 'political'])).toBe(false);
  });

  it('returns null when Google has no match', () => {
    expect(parseForwardGeocodeLocation({ status: 'ZERO_RESULTS', results: [] })).toBeNull();
  });
});

describe('pricing used by bulk rows', () => {
  // Bulk rows are Next Day, priced with the merchant's own rule.
  it('uses the merchant Next Day rule', () => {
    const rule = DEFAULT_PRICING_RULES.merchant.next_day;
    expect(rule.deliveryType).toBe('next_day');
    expect(calculateShipmentPrice({ rule, distanceKm: 14, weightKg: 1 }).totalPrice).toBeGreaterThan(0);
  });
});
