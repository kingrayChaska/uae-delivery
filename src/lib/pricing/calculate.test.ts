import { describe, expect, it } from 'vitest';

import { calculateShipmentPrice, sumPrices } from '@/lib/pricing/calculate';
import { DEFAULT_PRICING_RULES } from '@/lib/pricing/config';

const SAME_DAY = DEFAULT_PRICING_RULES.individual.same_day;
const NEXT_DAY = DEFAULT_PRICING_RULES.individual.next_day;
const MERCHANT_SAME_DAY = DEFAULT_PRICING_RULES.merchant.same_day;

describe('calculateShipmentPrice — same-day (5 km / AED 12 / AED 1 per km)', () => {
  it('matches the original worked example: 14.6 km -> AED 21.60', () => {
    const result = calculateShipmentPrice({ rule: SAME_DAY, distanceKm: 14.6, durationMinutes: 25 });
    expect(result.basePrice).toBe(12);
    expect(result.additionalDistanceKm).toBe(9.6);
    expect(result.distanceCharge).toBe(9.6);
    expect(result.totalPrice).toBe(21.6);
  });

  it.each([
    [0, 12],
    [1, 12],
    [5, 12],
    [5.1, 12.1],
    [6, 13],
    [10, 17],
    [12.7, 19.7],
    [20, 27],
    [30, 37],
    [50, 57],
  ])('distance %s km -> AED %s', (distanceKm, expected) => {
    expect(calculateShipmentPrice({ rule: SAME_DAY, distanceKm }).totalPrice).toBeCloseTo(expected, 2);
  });

  it('prices Google\'s route distance in metres without rounding it to whole km first', () => {
    // 12,734 m from computeRoutes -> 12.73 km billable (10 m = 1 fils at AED 1/km).
    const result = calculateShipmentPrice({ rule: SAME_DAY, distanceKm: 12734 / 1000 });
    expect(result.distanceKm).toBe(12.73);
    expect(result.totalPrice).toBe(19.73);
  });
});

describe('calculateShipmentPrice — next-day (AED 8 first 5 km, AED 0.75 per extra km)', () => {
  // The exact table from the spec.
  it.each([
    [1, 8],
    [5, 8],
    [6, 8.75],
    [10, 11.75],
    [20, 19.25],
  ])('distance %s km -> AED %s', (distanceKm, expected) => {
    expect(calculateShipmentPrice({ rule: NEXT_DAY, distanceKm }).totalPrice).toBe(expected);
  });

  it('is cheaper than same-day for the same trip', () => {
    const nextDay = calculateShipmentPrice({ rule: NEXT_DAY, distanceKm: 12 }).totalPrice;
    const sameDay = calculateShipmentPrice({ rule: SAME_DAY, distanceKm: 12 }).totalPrice;
    expect(nextDay).toBeLessThan(sameDay);
  });
});

describe('calculateShipmentPrice — weight (20 kg included, AED 1 per extra kg)', () => {
  // The exact table from the spec, on top of a 5 km next-day base of AED 8.
  it.each([
    [5, 0],
    [20, 0],
    [21, 1],
    [22, 2],
    [25, 5],
    [30, 10],
  ])('%s kg -> weight charge AED %s', (weightKg, charge) => {
    const result = calculateShipmentPrice({ rule: NEXT_DAY, distanceKm: 5, weightKg });
    expect(result.weightCharge).toBe(charge);
    expect(result.totalPrice).toBe(8 + charge);
  });

  it('treats a missing weight as within the allowance', () => {
    const result = calculateShipmentPrice({ rule: NEXT_DAY, distanceKm: 5, weightKg: null });
    expect(result.weightCharge).toBe(0);
    expect(result.weightKg).toBeNull();
  });

  it('charges the fractional kilogram exactly (weight - 20)', () => {
    expect(calculateShipmentPrice({ rule: NEXT_DAY, distanceKm: 5, weightKg: 20.5 }).weightCharge).toBe(0.5);
  });
});

describe('calculateShipmentPrice — distance limit', () => {
  it.each([
    [49.99, false],
    [50, false],
    [50.01, true],
    [80, true],
  ])('%s km exceeds the 50 km limit: %s', (distanceKm, exceeds) => {
    expect(calculateShipmentPrice({ rule: SAME_DAY, distanceKm }).exceedsDistanceLimit).toBe(exceeds);
  });

  it('checks the stored (2-decimal) distance, like the database does', () => {
    // 50.004 km is stored as 50.00 km, which is within the limit.
    expect(calculateShipmentPrice({ rule: SAME_DAY, distanceKm: 50.004 }).exceedsDistanceLimit).toBe(false);
  });
});

describe('calculateShipmentPrice — COD', () => {
  it('adds the rule COD fee only for postpaid shipments', () => {
    const rule = { ...NEXT_DAY, codFee: 3 };
    expect(calculateShipmentPrice({ rule, distanceKm: 5, recipientPaymentType: 'prepaid' }).codCharge).toBe(0);
    const postpaid = calculateShipmentPrice({ rule, distanceKm: 5, recipientPaymentType: 'postpaid', codAmount: 450 });
    expect(postpaid.codCharge).toBe(3);
    // The collection amount is never part of the delivery fee.
    expect(postpaid.totalPrice).toBe(11);
  });
});

describe('calculateShipmentPrice — merchant flat rate', () => {
  it('charges the same for any distance within the limit, plus weight', () => {
    expect(calculateShipmentPrice({ rule: MERCHANT_SAME_DAY, distanceKm: 3, weightKg: 10 }).totalPrice).toBe(15);
    expect(calculateShipmentPrice({ rule: MERCHANT_SAME_DAY, distanceKm: 48, weightKg: 10 }).totalPrice).toBe(15);
    expect(calculateShipmentPrice({ rule: MERCHANT_SAME_DAY, distanceKm: 48, weightKg: 25 }).totalPrice).toBe(20);
  });
});

describe('calculateShipmentPrice — rounding', () => {
  it('bills the 2-decimal distance it returns (the value that gets stored)', () => {
    const result = calculateShipmentPrice({ rule: SAME_DAY, distanceKm: 14.567, durationMinutes: 18.4 });
    expect(result.distanceKm).toBe(14.57);
    expect(result.durationMinutes).toBe(18);
    expect(result.totalPrice).toBe(21.57);
  });

  // Regression (Phase 13 e2e): 24.7639 km was priced 31.76 but stored as
  // 24.8 km, which the database re-checks as 31.80 -> booking rejected.
  it('prices exactly the stored distance, so the database re-check agrees', () => {
    const result = calculateShipmentPrice({ rule: SAME_DAY, distanceKm: 24.7639 });
    expect(result.distanceKm).toBe(24.76);
    expect(result.totalPrice).toBe(31.76);
  });

  it('rounds half-fils up exactly like Postgres decimal math, without float drift', () => {
    // 5.03 extra km x 1.25 = 6.2875 -> 6.29 (float math gives 6.28749999...)
    expect(calculateShipmentPrice({ rule: { ...SAME_DAY, additionalPricePerKm: 1.25 }, distanceKm: 10.03 }).distanceCharge).toBe(6.29);
    // 0.01 x 0.5 = 0.005 -> 0.01
    expect(calculateShipmentPrice({ rule: { ...SAME_DAY, additionalPricePerKm: 0.5 }, distanceKm: 5.01 }).distanceCharge).toBe(0.01);
  });

  it('components always add up to the total', () => {
    const r = calculateShipmentPrice({ rule: { ...NEXT_DAY, codFee: 2.5 }, distanceKm: 17.33, weightKg: 27.45, recipientPaymentType: 'postpaid' });
    expect(Math.round((r.basePrice + r.distanceCharge + r.weightCharge + r.codCharge) * 100)).toBe(Math.round(r.totalPrice * 100));
  });

  it('sums several shipments without float drift', () => {
    expect(sumPrices([8.75, 11.75, 19.25, 0.1, 0.2])).toBe(40.05);
  });
});
