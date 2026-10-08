import { describe, expect, it } from 'vitest';

import { driverOutcomeSchema, proofOfDeliverySchema } from '@/lib/driver/schemas';

// The database enforces the same rules (complete_delivery,
// driver_cancel_shipment, driver_return_shipment — migration 0037; checked
// by database/test/attacks.sql). These cover the driver's form messages.

const SHIPMENT = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60';
const PHOTO = `${SHIPMENT}/return-1.jpg`;

const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error?.issues[0]?.message;

describe('driverOutcomeSchema (cancel / return)', () => {
  it('accepts a reason and a photo', () => {
    expect(driverOutcomeSchema.safeParse({ shipmentId: SHIPMENT, reason: 'Recipient refused the parcel', photoPath: PHOTO }).success).toBe(true);
  });

  it('needs a photo', () => {
    expect(firstError(driverOutcomeSchema.safeParse({ shipmentId: SHIPMENT, reason: 'No response', photoPath: null }))).toBe('driver.validation.outcomePhoto');
    expect(firstError(driverOutcomeSchema.safeParse({ shipmentId: SHIPMENT, reason: 'No response', photoPath: '' }))).toBe('driver.validation.outcomePhoto');
    expect(firstError(driverOutcomeSchema.safeParse({ shipmentId: SHIPMENT, reason: 'No response' }))).toBe('driver.validation.outcomePhoto');
  });

  it('needs a reason, not just spaces', () => {
    expect(firstError(driverOutcomeSchema.safeParse({ shipmentId: SHIPMENT, reason: '   ', photoPath: PHOTO }))).toBe('driver.validation.reason');
  });

  it('keeps the reason under 500 characters', () => {
    expect(firstError(driverOutcomeSchema.safeParse({ shipmentId: SHIPMENT, reason: 'x'.repeat(501), photoPath: PHOTO }))).toBe('driver.validation.reasonTooLong');
  });
});

describe('proofOfDeliverySchema (delivered)', () => {
  const base = { shipmentId: SHIPMENT, photoPath: `${SHIPMENT}/photo-1.jpg`, notes: 'Handed to the recipient', collectsCod: false, codCollected: false };

  it('accepts a photo and a note', () => {
    expect(proofOfDeliverySchema.safeParse(base).success).toBe(true);
  });

  it('needs a photo', () => {
    expect(firstError(proofOfDeliverySchema.safeParse({ ...base, photoPath: null }))).toBe('driver.validation.photo');
  });

  it('needs a note, not just spaces', () => {
    expect(firstError(proofOfDeliverySchema.safeParse({ ...base, notes: '  ' }))).toBe('driver.validation.note');
  });

  it('keeps the note under 500 characters', () => {
    expect(firstError(proofOfDeliverySchema.safeParse({ ...base, notes: 'x'.repeat(501) }))).toBe('driver.validation.noteTooLong');
  });

  it('still needs the COD confirmation when there is cash to collect', () => {
    expect(firstError(proofOfDeliverySchema.safeParse({ ...base, collectsCod: true }))).toBe('driver.validation.codCollected');
  });
});
