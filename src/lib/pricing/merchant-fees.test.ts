import { describe, expect, it } from 'vitest';

import { DEFAULT_PRICING_RULES } from '@/lib/pricing/config';
import { calculateShipmentPrice } from '@/lib/pricing/calculate';
import { merchantFeeTier, merchantTierFee } from '@/lib/pricing/merchant-fees';

const NEXT_DAY = DEFAULT_PRICING_RULES.merchant.next_day;
const SAME_DAY = DEFAULT_PRICING_RULES.merchant.same_day;

const quote = (rule: typeof NEXT_DAY, orderCount: number, extra: Partial<Parameters<typeof calculateShipmentPrice>[0]> = {}) =>
  calculateShipmentPrice({ rule, distanceKm: 40, weightKg: 30, recipientPaymentType: 'prepaid', orderCount, ...extra });

// The same table as merchant_fee_policy() in migration 0050;
// database/test/merchant-fee-policy.sql checks the database side.
describe('merchant fee policy', () => {
  it.each([
    ['next_day', 'postpaid', 1, 'cod_no_fee', 0],
    ['next_day', 'postpaid', 7, 'cod_no_fee', 0],
    ['same_day', 'postpaid', 3, 'cod_no_fee', 0],
    ['next_day', 'prepaid', 5, 'next_day_5_plus', 15],
    ['next_day', 'prepaid', 120, 'next_day_5_plus', 15],
    ['next_day', 'prepaid', 2, 'next_day_2_4', 20],
    ['next_day', 'prepaid', 4, 'next_day_2_4', 20],
    ['next_day', 'prepaid', 1, 'unconfirmed', null],
    ['same_day', 'prepaid', 1, 'unconfirmed', null],
    ['same_day', 'prepaid', 3, 'unconfirmed', null],
    ['same_day', 'prepaid', 9, 'unconfirmed', null],
  ] as const)('%s, %s, %d orders → %s (%s)', (deliveryType, recipientPaymentType, orderCount, tier, fee) => {
    expect(merchantFeeTier({ deliveryType, recipientPaymentType, orderCount })).toBe(tier);
    expect(merchantTierFee(tier)).toBe(fee);
  });

  it('a non-COD Next-Day booking of 5+ is AED 15 flat — no distance or weight on top', () => {
    const q = quote(NEXT_DAY, 5);
    expect([q.totalPrice, q.basePrice, q.distanceCharge, q.weightCharge, q.codCharge]).toEqual([15, 15, 0, 0, 0]);
    expect(q.merchantFeeTier).toBe('next_day_5_plus');
  });

  it('a non-COD Next-Day booking of 2–4 is AED 20 flat', () => {
    for (const orderCount of [2, 3, 4]) expect(quote(NEXT_DAY, orderCount).totalPrice).toBe(20);
  });

  it('cases no rate covers are not given an invented rate: the merchant rule applies, flagged', () => {
    // 30 kg on the default rule (20 kg included, AED 1/kg): AED 15 + 10.
    const single = quote(NEXT_DAY, 1);
    expect(single.merchantFeeTier).toBe('unconfirmed');
    expect(single.totalPrice).toBe(calculateShipmentPrice({ ...{ rule: { ...NEXT_DAY, accountType: 'individual' as const } }, distanceKm: 40, weightKg: 30 }).totalPrice);
    expect(quote(SAME_DAY, 6).merchantFeeTier).toBe('unconfirmed');
    expect(quote(SAME_DAY, 6).totalPrice).toBe(25);
  });

  it('never charges a fee on COD, whatever the size or speed', () => {
    for (const rule of [NEXT_DAY, SAME_DAY]) {
      for (const orderCount of [1, 3, 5, 50]) {
        expect(quote(rule, orderCount, { recipientPaymentType: 'postpaid', codAmount: 999 }).totalPrice).toBe(0);
      }
    }
  });

  it('leaves individual customers exactly as before, whatever the order count', () => {
    const rule = DEFAULT_PRICING_RULES.individual.next_day;
    const alone = calculateShipmentPrice({ rule, distanceKm: 52 });
    const many = calculateShipmentPrice({ rule, distanceKm: 52, orderCount: 9 });
    expect(many).toEqual(alone);
    expect(alone.merchantFeeTier).toBeNull();
    expect(calculateShipmentPrice({ rule, distanceKm: 10, recipientPaymentType: 'postpaid' }).codCharge).toBe(rule.codFee);
  });
});
