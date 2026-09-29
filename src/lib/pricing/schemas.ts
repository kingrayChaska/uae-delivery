import { z } from '@/lib/zod';

import { ACCOUNT_TYPES, DELIVERY_TYPES } from '@/lib/types';

const amount = (max: number) => z.number({ error: 'Enter a number' }).min(0, 'Can’t be negative').max(max, `At most ${max}`);

export const pricingRuleSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(80, 'Keep the name under 80 characters'),
  deliveryType: z.enum(DELIVERY_TYPES),
  accountType: z.enum(ACCOUNT_TYPES),
  baseDistanceKm: amount(100),
  basePrice: amount(10000),
  // 0 = a flat rate up to the maximum distance (how merchant rates work).
  additionalPricePerKm: amount(1000),
  includedWeightKg: amount(1000),
  additionalPricePerKg: amount(1000),
  codFee: amount(1000),
  maxDistanceKm: z.number({ error: 'Enter a number' }).positive('Must be more than 0').max(500, 'At most 500'),
  activate: z.boolean(),
});

export type PricingRuleInput = z.infer<typeof pricingRuleSchema>;
