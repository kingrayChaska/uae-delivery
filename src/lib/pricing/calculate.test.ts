import { describe, expect, it } from 'vitest';

import { DEFAULT_PRICING_RULE, calculatePrice } from '@/lib/pricing/calculate';

describe('calculatePrice', () => {
  // Worked example from the original spec: 14.6km on the standard
  // 5km/AED12/AED1-per-km rule should come out to exactly AED 21.60.
  it('matches the spec worked example for 14.6 km', () => {
    const result = calculatePrice(14.6, 25, DEFAULT_PRICING_RULE);

    expect(result.baseDistanceKm).toBe(5);
    expect(result.basePrice).toBe(12);
    expect(result.additionalDistanceKm).toBe(9.6);
    expect(result.additionalPrice).toBe(9.6);
    expect(result.totalPrice).toBe(21.6);
  });

  // The exact matrix from spec section 45 ("Pricing: test 0, 1, 5, 5.1, 6,
  // 10, 20, 50+ km"), plus longer intra-UAE trips.
  it.each([
    [0, 12],
    [1, 12],
    [5, 12],
    [5.1, 12.1],
    [6, 13],
    [10, 17],
    [15, 22],
    [20, 27],
    [50, 57],
    [75.5, 82.5],
    [150, 157],
  ])('distance %skm -> total AED %s', (distanceKm, expectedTotal) => {
    const result = calculatePrice(distanceKm, 10, DEFAULT_PRICING_RULE);
    expect(result.totalPrice).toBeCloseTo(expectedTotal, 2);
  });

  it('never charges less than the base price, even for 0 km', () => {
    const result = calculatePrice(0, 0, DEFAULT_PRICING_RULE);
    expect(result.totalPrice).toBe(12);
    expect(result.additionalDistanceKm).toBe(0);
  });

  it('bills the 2-decimal distance it returns (the value that gets stored)', () => {
    const result = calculatePrice(14.567, 18.4, DEFAULT_PRICING_RULE);
    expect(result.distanceKm).toBe(14.57);
    expect(result.durationMinutes).toBe(18);
    expect(result.totalPrice).toBe(21.57);
  });

  // Regression (Phase 13 e2e): 24.7639 km was priced 31.76 but stored as
  // 24.8 km, which the database re-checks as 31.80 -> booking rejected.
  it('prices exactly the stored distance, so the database re-check agrees', () => {
    const result = calculatePrice(24.7639, 37, DEFAULT_PRICING_RULE);
    expect(result.distanceKm).toBe(24.76);
    expect(result.totalPrice).toBe(Number((12 + (result.distanceKm - 5) * 1).toFixed(2)));
  });

  it('rounds half-fils up exactly like Postgres decimal math, without float drift', () => {
    const rule = { ...DEFAULT_PRICING_RULE, additionalPricePerKm: 1.25 };
    // 5.03 extra km x 1.25 = 6.2875 -> 6.29 (float math gives 6.28749999...)
    expect(calculatePrice(10.03, 10, rule).additionalPrice).toBe(6.29);
    // 0.01 x 0.5 = 0.005 -> 0.01
    expect(calculatePrice(5.01, 1, { ...DEFAULT_PRICING_RULE, additionalPricePerKm: 0.5 }).additionalPrice).toBe(0.01);
  });
});

describe('calculatePrice with a non-default rule', () => {
  it('uses the rule it is given, not hard-coded numbers', () => {
    const premium = { ...DEFAULT_PRICING_RULE, id: 'p', baseDistanceKm: 3, basePrice: 20, additionalPricePerKm: 2.5 };
    expect(calculatePrice(3, 5, premium).totalPrice).toBe(20);
    expect(calculatePrice(7, 12, premium).totalPrice).toBe(30);
    expect(calculatePrice(10.4, 15, premium).totalPrice).toBe(38.5);
  });
});
