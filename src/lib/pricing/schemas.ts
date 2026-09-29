import { z } from '@/lib/zod';
import { msg } from '@/i18n/message';

import { ACCOUNT_TYPES, DELIVERY_TYPES } from '@/lib/types';

const amount = (max: number) =>
  z
    .number({ error: 'manager.pricing.validation.number' })
    .min(0, 'manager.pricing.validation.negative')
    .max(max, msg('manager.pricing.validation.max', { max }));

export const pricingRuleSchema = z.object({
  name: z.string().trim().min(2, 'manager.pricing.validation.name').max(80, 'manager.pricing.validation.nameTooLong'),
  deliveryType: z.enum(DELIVERY_TYPES),
  accountType: z.enum(ACCOUNT_TYPES),
  baseDistanceKm: amount(100),
  basePrice: amount(10000),
  // 0 = a flat rate up to the maximum distance (how merchant rates work).
  additionalPricePerKm: amount(1000),
  includedWeightKg: amount(1000),
  additionalPricePerKg: amount(1000),
  codFee: amount(1000),
  maxDistanceKm: z
    .number({ error: 'manager.pricing.validation.number' })
    .positive('manager.pricing.validation.positive')
    .max(500, msg('manager.pricing.validation.max', { max: 500 })),
  activate: z.boolean(),
});

export type PricingRuleInput = z.infer<typeof pricingRuleSchema>;
