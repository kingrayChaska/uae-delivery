import { z } from '@/lib/zod';

export const reportDeliveryFailedSchema = z.object({
  shipmentId: z.string().uuid(),
  reason: z.string().min(1, 'driver.validation.reason'),
});

export type ReportDeliveryFailedInput = z.infer<typeof reportDeliveryFailedSchema>;

// Cancelling (before pickup) and returning to the sender (after pickup)
// both need a reason. driver_cancel_shipment / driver_return_shipment
// (migration 0028) enforce the same rules.
export const driverOutcomeSchema = z.object({
  shipmentId: z.string().uuid(),
  reason: z.string().trim().min(1, 'driver.validation.reason').max(500, 'driver.validation.reasonTooLong'),
});

export type DriverOutcomeInput = z.infer<typeof driverOutcomeSchema>;

// A delivery photo is required; signature, OTP and QR are optional extra
// proof. A postpaid shipment also needs the driver's confirmation that the
// COD amount was collected. These refines give a fast, clear message;
// complete_delivery() (migration 0028) enforces both independently.
export const proofOfDeliverySchema = z
  .object({
    shipmentId: z.string().uuid(),
    photoPath: z.string().nullable().optional(),
    signaturePath: z.string().nullable().optional(),
    otpCode: z.string().nullable().optional(),
    qrToken: z.string().nullable().optional(),
    notes: z.string().optional(),
    // Whether this shipment has an amount to collect from the recipient.
    collectsCod: z.boolean(),
    codCollected: z.boolean(),
  })
  .refine((data) => Boolean(data.photoPath), {
    message: 'driver.validation.photo',
    path: ['photoPath'],
  })
  .refine((data) => !data.collectsCod || data.codCollected, {
    message: 'driver.validation.codCollected',
    path: ['codCollected'],
  });

export type ProofOfDeliveryInput = z.infer<typeof proofOfDeliverySchema>;
