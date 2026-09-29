import { z } from '@/lib/zod';

export const reportDeliveryFailedSchema = z.object({
  shipmentId: z.string().uuid(),
  reason: z.string().min(1, 'driver.validation.reason'),
});

export type ReportDeliveryFailedInput = z.infer<typeof reportDeliveryFailedSchema>;

// At least one proof is required (spec section 19). This refine is the
// client-side check for a fast error message; complete_delivery()
// (migration 0015) independently enforces it and verifies OTP/QR/uploads.
export const proofOfDeliverySchema = z
  .object({
    shipmentId: z.string().uuid(),
    recipientName: z.string().min(1, 'driver.validation.recipient'),
    photoPath: z.string().nullable().optional(),
    signaturePath: z.string().nullable().optional(),
    otpCode: z.string().nullable().optional(),
    qrToken: z.string().nullable().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => Boolean(data.photoPath || data.signaturePath || data.otpCode || data.qrToken), {
    message: 'driver.validation.proof',
    path: ['photoPath'],
  });

export type ProofOfDeliveryInput = z.infer<typeof proofOfDeliverySchema>;
