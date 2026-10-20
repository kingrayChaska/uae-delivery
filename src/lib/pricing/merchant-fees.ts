import type { DeliveryType, RecipientPaymentType } from '@/lib/types';

// The merchant delivery-fee policy (migration 0050) — the same table as
// merchant_fee_policy() in the database, which sets every merchant price
// at booking; this copy lets the booking screens show that price first
// (merchant-fees.test.ts checks the two agree).
//
//   recipient pays COD on delivery  'cod_no_fee'       no fee at all
//   Next-Day, 5 or more orders      'next_day_5_plus'  AED 15 flat
//   Next-Day, 2–4 orders            'next_day_2_4'     AED 20 flat
//   anything else                   'unconfirmed'      the merchant pricing
//                                                      rule, unchanged, until
//                                                      a rate is agreed
//
// Orders = the shipments booked together (one booking, or one bulk upload).
// The fee is billed to the merchant's account — never cash for the driver.
export const MERCHANT_FEE_TIERS = ['cod_no_fee', 'next_day_5_plus', 'next_day_2_4', 'unconfirmed'] as const;
export type MerchantFeeTier = (typeof MERCHANT_FEE_TIERS)[number];

export const MERCHANT_TIER_FEES: Record<Exclude<MerchantFeeTier, 'unconfirmed'>, number> = {
  cod_no_fee: 0,
  next_day_5_plus: 15,
  next_day_2_4: 20,
};

export const merchantFeeTier = ({
  deliveryType,
  recipientPaymentType,
  orderCount,
}: {
  deliveryType: DeliveryType;
  recipientPaymentType: RecipientPaymentType;
  orderCount: number;
}): MerchantFeeTier => {
  if (recipientPaymentType === 'postpaid') return 'cod_no_fee';
  if (deliveryType === 'next_day' && orderCount >= 5) return 'next_day_5_plus';
  if (deliveryType === 'next_day' && orderCount >= 2 && orderCount <= 4) return 'next_day_2_4';
  return 'unconfirmed';
};

// The flat fee of a tier; null when the pricing rule applies instead.
export const merchantTierFee = (tier: MerchantFeeTier): number | null => (tier === 'unconfirmed' ? null : MERCHANT_TIER_FEES[tier]);
