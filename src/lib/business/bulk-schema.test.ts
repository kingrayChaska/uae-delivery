import { describe, expect, it } from 'vitest';

import { parseCsvWithHeaders } from '@/lib/csv/parse';
import { missingBulkColumns, validateBulkRecords } from '@/lib/business/schemas';

const HEADER =
  'pickup_address,pickup_contact_name,pickup_contact_phone,dropoff_address,dropoff_contact_name,dropoff_contact_phone,package_type,package_description,quantity,weight_kg,fragile,payment_method';

describe('bulk upload row validation', () => {
  it('accepts a complete row and applies types/defaults', () => {
    const { records } = parseCsvWithHeaders(
      `${HEADER}\nDubai Marina,Ali,0501234567,JBR Walk,Sara,0507654321,,Shoes,2,1.5,yes,`,
    );
    const [result] = validateBulkRecords(records);
    expect(result.error).toBeNull();
    expect(result.row).toMatchObject({
      package_type: 'parcel',
      quantity: 2,
      weight_kg: 1.5,
      fragile: true,
      payment_method: 'cod',
    });
    expect(result.rowNumber).toBe(2);
  });

  it('reports the first error per row with its spreadsheet row number', () => {
    const { records } = parseCsvWithHeaders(
      `${HEADER}\nDubai Marina,Ali,0501234567,JBR Walk,Sara,0507654321,parcel,Shoes,1,,no,card\nDubai Marina,Ali,0501234567,,Sara,0507654321,parcel,Shoes,1,,no,card\nDubai Marina,Ali,0501234567,JBR,Sara,0507654321,crate,Shoes,1,,no,card`,
    );
    const results = validateBulkRecords(records);
    expect(results[0].error).toBeNull();
    expect(results[1]).toMatchObject({ rowNumber: 3, error: 'dropoff_address is required' });
    expect(results[2].error).toMatch(/package_type must be one of/);
  });

  it('rejects non-integer quantity and unknown payment methods', () => {
    const { records } = parseCsvWithHeaders(
      `${HEADER}\nDubai Marina,Ali,0501234567,JBR Walk,Sara,0507654321,parcel,Shoes,1.5,,no,cod\nDubai Marina,Ali,0501234567,JBR Walk,Sara,0507654321,parcel,Shoes,1,,no,bitcoin`,
    );
    const results = validateBulkRecords(records);
    expect(results[0].error).toBe('quantity must be a whole number');
    expect(results[1].error).toBe('payment_method must be card or cod');
  });

  it('defaults to same-day, prepaid and reads delivery_type / cod_amount when given', () => {
    const header = `${HEADER},delivery_type,cod_amount`;
    const { records } = parseCsvWithHeaders(
      `${header}\nDubai Marina,Ali,0501234567,JBR Walk,Sara,0507654321,,Shoes,1,,no,card,,\nDubai Marina,Ali,0501234567,JBR Walk,Sara,0507654321,,Shoes,1,,no,card,Next-Day,450\nDubai Marina,Ali,0501234567,JBR Walk,Sara,0507654321,,Shoes,1,,no,card,tomorrow,`,
    );
    const [plain, nextDayCod, bad] = validateBulkRecords(records);
    expect(plain.row).toMatchObject({ delivery_type: 'same_day', cod_amount: 0 });
    expect(nextDayCod.row).toMatchObject({ delivery_type: 'next_day', cod_amount: 450 });
    expect(bad.error).toBe('delivery_type must be same_day or next_day');
  });

  it('lists missing required columns but not optional ones', () => {
    expect(missingBulkColumns(['pickup_address', 'dropoff_address'])).toEqual([
      'pickup_contact_name',
      'pickup_contact_phone',
      'dropoff_contact_name',
      'dropoff_contact_phone',
      'package_description',
    ]);
  });
});
