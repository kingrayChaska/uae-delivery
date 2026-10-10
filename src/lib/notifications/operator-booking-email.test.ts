import { describe, expect, it } from 'vitest';

import { MAX_LISTED_BATCH_SHIPMENTS, renderBatchEmail, renderShipmentEmail } from '@/lib/notifications/operator-booking-email';

import type { OperatorBatchEmailData, OperatorShipmentEmailData } from '@/lib/notifications/operator-booking-email';

const ORIGIN = 'https://app.parcellinkuae.com';
const SHIPMENT_ID = '0b9f1d2e-3c4a-4b5c-8d6e-7f8091a2b3c4';
const BATCH_ID = '1c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';

const shipment = (overrides: Partial<OperatorShipmentEmailData> = {}): OperatorShipmentEmailData => ({
  id: SHIPMENT_ID,
  trackingNumber: 'PL7KX9QM',
  customer: { accountType: 'individual', name: 'Aisha Rahman', companyName: null, phone: '+971 50 123 4567' },
  status: 'confirmed',
  paymentMethod: 'cod',
  paymentStatus: 'pending',
  deliveryType: 'same_day',
  deliveryDate: null,
  pickupAddress: 'Al Barsha 1, Dubai',
  pickupContactName: 'Aisha Rahman',
  pickupContactPhone: '+971 50 123 4567',
  dropoffAddress: 'Business Bay, Dubai',
  packageType: 'parcel',
  packageDescription: 'Shoes',
  packageQuantity: 2,
  isFragile: false,
  createdAt: '2026-10-10T08:30:00Z',
  ...overrides,
});

const batch = (overrides: Partial<OperatorBatchEmailData> = {}): OperatorBatchEmailData => ({
  id: BATCH_ID,
  reference: 'BLK-20261010-A1B2C3D4',
  customer: { accountType: 'merchant', name: 'Omar Haddad', companyName: 'Desert Goods LLC', phone: '+971 4 555 0101' },
  pickupAddress: 'Warehouse 7, Al Quoz, Dubai',
  pickupDate: '2026-10-11',
  paymentMethod: 'cod',
  createdAt: '2026-10-10T08:30:00Z',
  shipmentCount: 3,
  rowsFailed: 1,
  shipments: [0, 1, 2].map((i) => ({
    id: `2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6${i}`,
    trackingNumber: `TRK0000${i}`,
    dropoffAddress: `Dropoff ${i}, Sharjah`,
    deliveryType: 'next_day',
    status: 'confirmed',
  })),
  ...overrides,
});

describe('renderShipmentEmail', () => {
  it('names the account type and tracking number in the subject', () => {
    expect(renderShipmentEmail(shipment(), ORIGIN).subject).toBe('New Individual Shipment — PL7KX9QM');
    expect(
      renderShipmentEmail(shipment({ customer: { accountType: 'merchant', name: 'Omar', companyName: 'Desert Goods', phone: null } }), ORIGIN).subject,
    ).toBe('New Merchant Shipment — PL7KX9QM');
  });

  it("links to the operator's shipment page on the configured origin", () => {
    const email = renderShipmentEmail(shipment(), ORIGIN);
    const url = `${ORIGIN}/dashboard/operator/shipments/${SHIPMENT_ID}`;
    expect(email.actionUrl).toBe(url);
    expect(email.html).toContain(`href="${url}"`);
    expect(email.html).toContain('View Shipment');
    expect(email.text).toContain(url);
  });

  it('includes the booking details that exist', () => {
    const { html, text } = renderShipmentEmail(shipment(), ORIGIN);
    for (const value of ['PL7KX9QM', SHIPMENT_ID, 'Individual', 'Aisha Rahman', 'Al Barsha 1, Dubai', 'Business Bay, Dubai', 'Same day', 'Parcel', 'Shoes', 'Cash', 'Pending', 'Confirmed']) {
      expect(html).toContain(value);
      expect(text).toContain(value);
    }
    expect(text).toContain('Quantity: 2');
    // 08:30 UTC is 12:30 in the UAE.
    expect(text).toMatch(/Booked at: 10 Oct 2026, 12:30 \(UAE\)/);
  });

  it('leaves out missing values instead of printing undefined or null', () => {
    const { html, text } = renderShipmentEmail(
      shipment({
        customer: { accountType: 'individual', name: null, companyName: null, phone: null },
        paymentStatus: null,
        packageDescription: '',
        pickupContactName: null,
        pickupContactPhone: null,
        packageQuantity: null,
      }),
      ORIGIN,
    );
    for (const out of [html, text]) {
      expect(out).not.toMatch(/undefined|null|NaN/);
    }
    expect(text).not.toContain('Payment status');
    expect(text).not.toContain('Description');
    expect(text).toContain('An individual customer booked a shipment.');
  });

  it('escapes customer-entered text', () => {
    const { html, subject } = renderShipmentEmail(
      shipment({
        trackingNumber: 'PL7KX9QM\r\nBcc: someone@example.com',
        packageDescription: '<script>alert(1)</script>',
        customer: { accountType: 'individual', name: '<a href="https://evil.example">Click</a>', companyName: null, phone: null },
      }),
      ORIGIN,
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="https://evil.example"');
    expect(html).toContain('&lt;script&gt;');
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('refuses to build a link from an id that is not a uuid', () => {
    expect(() => renderShipmentEmail(shipment({ id: '../../admin' }), ORIGIN)).toThrow();
  });
});

describe('renderBatchEmail', () => {
  it('sends one summary naming the reference and count', () => {
    const email = renderBatchEmail(batch(), ORIGIN);
    expect(email.subject).toBe('New Merchant Bulk Booking — BLK-20261010-A1B2C3D4 (3 shipments)');
    expect(email.actionUrl).toBe(`${ORIGIN}/dashboard/operator/bulk/${BATCH_ID}`);
    expect(email.html).toContain('Desert Goods LLC (Omar Haddad)');
    expect(email.text).toContain('Rows not booked: 1');
    expect(email.text).toContain('Warehouse 7, Al Quoz, Dubai');
  });

  it('lists each shipment with its own link', () => {
    const { html } = renderBatchEmail(batch(), ORIGIN);
    for (const s of batch().shipments) {
      expect(html).toContain(s.trackingNumber);
      expect(html).toContain(`${ORIGIN}/dashboard/operator/shipments/${s.id}`);
    }
  });

  it('caps the list and points at the batch page for the rest', () => {
    const shipments = Array.from({ length: MAX_LISTED_BATCH_SHIPMENTS }, (_, i) => ({
      id: `3d4e5f6a-7b8c-4d9e-8f0a-${String(i).padStart(12, '0')}`,
      trackingNumber: `T${i}`,
      dropoffAddress: null,
      deliveryType: null,
      status: 'confirmed',
    }));
    const { html, text } = renderBatchEmail(batch({ shipmentCount: 240, shipments }), ORIGIN);
    expect(html).toContain('…and 215 more');
    expect(text).toContain('…and 215 more');
    expect(html).not.toMatch(/undefined|null/);
  });

  it('calls an individual multi-shipment booking a booking, not a bulk list', () => {
    const email = renderBatchEmail(
      batch({ customer: { accountType: 'individual', name: 'Aisha', companyName: null, phone: null }, shipmentCount: 2, rowsFailed: 0 }),
      ORIGIN,
    );
    expect(email.subject).toBe('New Individual Multi-shipment Booking — BLK-20261010-A1B2C3D4 (2 shipments)');
    expect(email.text).not.toContain('Rows not booked');
  });
});
