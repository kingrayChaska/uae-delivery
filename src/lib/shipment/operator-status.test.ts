import { describe, expect, it } from 'vitest';

import { OPERATOR_STATUS_CANONICAL, OPERATOR_STATUS_OPTIONS } from '@/lib/shipment/operator-status';

describe('Operator shipment statuses', () => {
  it('offers only the four administrative options in the requested order', () => {
    expect(OPERATOR_STATUS_OPTIONS).toEqual(['pending', 'cancel', 'delivered', 'returned']);
  });

  it('maps display choices to the existing canonical database statuses', () => {
    expect(OPERATOR_STATUS_CANONICAL).toEqual({
      pending: 'confirmed',
      cancel: 'cancelled',
      delivered: 'delivered',
      returned: 'returned',
    });
  });
});
