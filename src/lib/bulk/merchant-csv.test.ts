import { describe, expect, it } from 'vitest';

import { parseCsv, parseCsvRecords, parseCsvWithHeaders } from '@/lib/csv/parse';
import {
  MERCHANT_BULK_COLUMNS,
  TEMPLATE_EXAMPLE,
  cleanCell,
  fieldForBookingPath,
  isBookableStatus,
  isUaePhone,
  merchantTemplateCsv,
  missingMerchantColumns,
  normalizedRowKey,
  parseCsvDate,
  parseMerchantRow,
  rowStatusFor,
  toMerchantRowInput,
} from '@/lib/bulk/merchant-csv';
import { classifyServiceArea } from '@/lib/service-areas/config';
import { isTooGeneral, parseForwardGeocodeLocation } from '@/lib/maps/google-client';
import { calculateShipmentPrice } from '@/lib/pricing/calculate';
import { DEFAULT_PRICING_RULES } from '@/lib/pricing/config';

import type { MerchantRowInput } from '@/lib/bulk/merchant-csv';

const TODAY = '2026-10-02';

const row = (overrides: Partial<MerchantRowInput> = {}): MerchantRowInput => ({
  ...TEMPLATE_EXAMPLE,
  delivery_date: TODAY,
  ...overrides,
});

const fields = (input: MerchantRowInput) => parseMerchantRow(input, TODAY).issues.map((issue) => `${issue.severity}:${issue.field}`);

describe('merchant CSV template', () => {
  it('has a header row and one example row that passes validation', () => {
    const csv = merchantTemplateCsv(TODAY);
    expect(csv.startsWith('﻿')).toBe(true);
    const { headers, records } = parseCsvWithHeaders(csv);
    expect(headers).toEqual([...MERCHANT_BULK_COLUMNS]);
    expect(records).toHaveLength(1);
    expect(missingMerchantColumns(headers)).toEqual([]);
    const { row: parsed, issues } = parseMerchantRow(toMerchantRowInput(records[0]), TODAY);
    expect(issues).toEqual([]);
    expect(parsed).toMatchObject({ recipientPaymentType: 'postpaid', codAmount: 150, deliveryDate: TODAY, weightKg: 2.5 });
  });

  it('reports missing required columns', () => {
    expect(missingMerchantColumns(['recipient_name', 'pickup_address'])).toEqual([
      'recipient_phone',
      'delivery_address',
      'package_description',
      'quantity',
      'weight_kg',
      'delivery_date',
      'cod_type',
    ]);
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
    expect(parseCsvRecords('﻿a\r\n\r\nb\r\n').map((r) => r.row)).toEqual([1, 3]);
  });

  it('parses an empty file as nothing', () => {
    expect(parseCsvWithHeaders('').records).toEqual([]);
    expect(parseCsvWithHeaders('﻿\r\n').headers).toEqual([]);
  });

  it('parses 1,000 rows', () => {
    const body = Array.from({ length: 1000 }, (_, i) => `Name ${i},+97150${String(i).padStart(7, '0')}`).join('\n');
    expect(parseCsvWithHeaders(`recipient_name,recipient_phone\n${body}`).records).toHaveLength(1000);
  });

  it('strips control characters and keeps formula-looking text as plain text', () => {
    expect(cleanCell('  Ahmed\u0000 Ali\u0007 ')).toBe('Ahmed Ali');
    // Stored and shown as text; exports escape it (lib/csv/serialize).
    expect(cleanCell('=HYPERLINK("x")')).toBe('=HYPERLINK("x")');
    // The export escape is undone, so a downloaded report reads back as written.
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
  it('accepts a complete prepaid row', () => {
    const { row: parsed, issues } = parseMerchantRow(row({ cod_type: 'Prepaid', cod_amount: '' }), TODAY);
    expect(issues).toEqual([]);
    expect(parsed?.recipientPaymentType).toBe('prepaid');
    expect(parsed?.codAmount).toBeUndefined();
  });

  it('requires recipient, phone, addresses, description, quantity, weight, date and COD type', () => {
    const empty = Object.fromEntries(MERCHANT_BULK_COLUMNS.map((c) => [c, ''])) as MerchantRowInput;
    expect(fields(empty)).toEqual([
      'error:recipient_name',
      'error:recipient_phone',
      'error:pickup_address',
      'error:delivery_address',
      'error:package_description',
      'error:quantity',
      'error:weight_kg',
      'error:delivery_date',
      'error:cod_type',
    ]);
  });

  it('checks quantity, weight and package value', () => {
    expect(fields(row({ quantity: '0' }))).toEqual(['error:quantity']);
    expect(fields(row({ quantity: '1.5' }))).toEqual(['error:quantity']);
    expect(fields(row({ quantity: 'two' }))).toEqual(['error:quantity']);
    expect(fields(row({ weight_kg: '-1' }))).toEqual(['error:weight_kg']);
    expect(fields(row({ package_value: '-5' }))).toEqual(['error:package_value']);
    expect(fields(row({ package_value: 'abc' }))).toEqual(['error:package_value']);
    expect(parseMerchantRow(row({ package_value: '1,250.50' }), TODAY).row?.packageValue).toBe(1250.5);
  });

  it('applies the COD rules', () => {
    expect(fields(row({ cod_type: 'Prepaid', cod_amount: '100' }))).toEqual(['error:cod_amount']);
    expect(fields(row({ cod_type: 'Prepaid', cod_amount: '0' }))).toEqual([]);
    expect(fields(row({ cod_type: 'Postpaid', cod_amount: '' }))).toEqual(['error:cod_amount']);
    expect(fields(row({ cod_type: 'Postpaid', cod_amount: '0' }))).toEqual(['error:cod_amount']);
    expect(fields(row({ cod_type: 'Postpaid', cod_amount: 'lots' }))).toEqual(['error:cod_amount']);
    expect(fields(row({ cod_type: 'Maybe' }))).toEqual(['error:cod_type']);
    expect(parseMerchantRow(row({ cod_type: 'cod', cod_amount: '75' }), TODAY).row?.recipientPaymentType).toBe('postpaid');
  });

  it('validates phone numbers: UAE formats pass, others are only a warning', () => {
    for (const phone of ['+971501234567', '0501234567', '00971 50 123 4567', '042345678', '+971 4 234 5678']) {
      expect(isUaePhone(phone)).toBe(true);
    }
    expect(isUaePhone('+447911123456')).toBe(false);
    const { row: parsed, issues } = parseMerchantRow(row({ recipient_phone: '+447911123456' }), TODAY);
    expect(parsed).not.toBeNull();
    expect(issues.map((i) => `${i.severity}:${i.field}`)).toEqual(['warning:recipient_phone']);
    expect(rowStatusFor(issues)).toBe('warning');
  });

  it('validates delivery dates', () => {
    expect(parseCsvDate('2026-10-05')).toBe('2026-10-05');
    expect(parseCsvDate('05/10/2026')).toBe('2026-10-05');
    expect(parseCsvDate('2026-02-30')).toBeNull();
    expect(parseCsvDate('Oct 5')).toBeNull();
    expect(fields(row({ delivery_date: '2026-10-01' }))).toEqual(['error:delivery_date']);
    expect(fields(row({ delivery_date: '2027-06-01' }))).toEqual(['error:delivery_date']);
    expect(fields(row({ delivery_date: 'tomorrow' }))).toEqual(['error:delivery_date']);
    expect(fields(row({ delivery_type: 'next_day' }))).toEqual(['error:delivery_date']);
    expect(fields(row({ delivery_type: 'next-day', delivery_date: '2026-10-03' }))).toEqual([]);
  });

  it('validates the optional columns', () => {
    expect(fields(row({ delivery_type: 'express' }))).toEqual(['error:delivery_type']);
    expect(fields(row({ package_type: 'pallet' }))).toEqual(['error:package_type']);
    expect(fields(row({ fragile: 'maybe' }))).toEqual(['error:fragile']);
    expect(parseMerchantRow(row({ fragile: 'Yes', package_type: '', delivery_type: '' }), TODAY).row).toMatchObject({
      isFragile: true,
      packageType: 'parcel',
      deliveryType: 'same_day',
    });
  });

  it('maps booking-schema paths back to template columns', () => {
    expect(fieldForBookingPath(['dropoff', 'contactPhone'])).toBe('recipient_phone');
    expect(fieldForBookingPath(['pickup', 'contactPhone'])).toBe('pickup_contact_phone');
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
    expect(parsed?.location.coordinates).toEqual({ lat: 25.1972, lng: 55.2796 });
    expect(parsed?.partialMatch).toBe(false);
    expect(classifyServiceArea(parsed!.location.place)).toEqual({ status: 'active', emirate: 'Dubai' });
  });

  it('flags partial matches and city-only results', () => {
    expect(parseForwardGeocodeLocation(result(['route'], { partial_match: true }))?.partialMatch).toBe(true);
    expect(isTooGeneral(['locality', 'political'])).toBe(true);
    expect(isTooGeneral(['administrative_area_level_1', 'political'])).toBe(true);
    expect(isTooGeneral(['neighborhood', 'political'])).toBe(false);
    expect(isTooGeneral(['establishment'])).toBe(false);
  });

  it('returns null when Google has no match', () => {
    expect(parseForwardGeocodeLocation({ status: 'ZERO_RESULTS', results: [] })).toBeNull();
  });
});

describe('pricing used by bulk rows', () => {
  // Bulk rows are priced by quoteShipment → calculateShipmentPrice, the
  // same engine as a single booking. The customer example from the spec:
  it('matches AED 12 for the first 5 km then AED 1 per km', () => {
    const rule = DEFAULT_PRICING_RULES.individual.same_day;
    expect([5, 8, 14].map((distanceKm) => calculateShipmentPrice({ rule, distanceKm, weightKg: 1 }).totalPrice)).toEqual([12, 15, 21]);
    expect(calculateShipmentPrice({ rule, distanceKm: 90.01, weightKg: 1 }).exceedsDistanceLimit).toBe(true);
  });

  it('uses the merchant rule for merchants, not the customer one', () => {
    const rule = DEFAULT_PRICING_RULES.merchant.same_day;
    expect(calculateShipmentPrice({ rule, distanceKm: 14, weightKg: 1 }).totalPrice).toBe(15);
  });
});
