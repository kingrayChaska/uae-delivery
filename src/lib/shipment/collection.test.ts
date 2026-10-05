import { describe, expect, it } from 'vitest';

import { cashCollection } from '@/lib/shipment/collection';

const shipment = (overrides: Partial<Parameters<typeof cashCollection>[0]> = {}) => ({
  recipientPaymentType: 'postpaid' as const,
  codAmount: 150,
  paymentMethod: 'cod' as const,
  price: 15,
  currency: 'AED',
  ...overrides,
});

describe('cashCollection', () => {
  it('collects only the COD amount from the recipient, never the delivery fee on top', () => {
    // The reported case: AED 150 goods + AED 15 cash fee must not become AED 165.
    expect(cashCollection(shipment())).toEqual({ fromRecipient: 150, senderCashFee: 15, currency: 'AED' });
  });

  it('collects nothing from the recipient of a prepaid shipment', () => {
    expect(cashCollection(shipment({ recipientPaymentType: 'prepaid', codAmount: 0 })).fromRecipient).toBe(0);
  });

  it('keeps the recipient amount the same whether the sender pays the fee by card or cash', () => {
    const card = cashCollection(shipment({ paymentMethod: 'card' }));
    const cash = cashCollection(shipment({ paymentMethod: 'cod' }));
    expect(card).toEqual({ fromRecipient: 150, senderCashFee: 0, currency: 'AED' });
    expect(cash.fromRecipient).toBe(card.fromRecipient);
  });

  it.each([
    [150, 0],
    [150, 12],
    [150, 27.5],
    [39, 15],
    [0.5, 99.99],
    [100000, 15],
  ])('COD %d with a %d fee collects exactly the COD amount', (codAmount, price) => {
    const result = cashCollection(shipment({ codAmount, price }));
    expect(result.fromRecipient).toBe(codAmount);
    expect(result.senderCashFee).toBe(price);
  });

  it('reads PostgREST numeric strings as numbers', () => {
    const result = cashCollection(shipment({ codAmount: '150.00' as unknown as number, price: '15.00' as unknown as number }));
    expect(result).toEqual({ fromRecipient: 150, senderCashFee: 15, currency: 'AED' });
  });
});
