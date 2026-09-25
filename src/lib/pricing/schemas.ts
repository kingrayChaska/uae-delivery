import { z } from '@/lib/zod';

export const pricingRuleSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  baseDistanceKm: z.number({ error: 'Enter a number' }).min(0).max(100),
  basePrice: z.number({ error: 'Enter a number' }).min(0).max(10000),
  additionalPricePerKm: z.number({ error: 'Enter a number' }).min(0).max(1000),
  activate: z.boolean(),
});

export type PricingRuleInput = z.infer<typeof pricingRuleSchema>;
