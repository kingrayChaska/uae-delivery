import { z } from '@/lib/zod';

export const reportDeliveryFailedSchema = z.object({
  shipmentId: z.string().uuid(),
  reason: z.string().min(1, 'driver.validation.reason'),
});

export type ReportDeliveryFailedInput = z.infer<typeof reportDeliveryFailedSchema>;

// Cancelling (before pickup) and returning to the sender (after pickup)
// both need a reason and a photo. driver_cancel_shipment /
// driver_return_shipment (migrations 0028, 0037) enforce the same rules.
export const driverOutcomeSchema = z.object({
  shipmentId: z.string().uuid(),
  reason: z.string().trim().min(1, 'driver.validation.reason').max(500, 'driver.validation.reasonTooLong'),
  photoPath: z.string({ error: 'driver.validation.outcomePhoto' }).min(1, 'driver.validation.outcomePhoto'),
});

export type DriverOutcomeInput = z.infer<typeof driverOutcomeSchema>;

// A delivery photo and a note are required; signature, OTP and QR are
// optional extra proof. A postpaid shipment also needs the driver's
// confirmation that the COD amount was collected. These give a fast, clear
// message; complete_delivery() (migrations 0028, 0037) enforces them
// independently.
export const proofOfDeliverySchema = z
  .object({
    shipmentId: z.string().uuid(),
    photoPath: z.string().nullable().optional(),
    signaturePath: z.string().nullable().optional(),
    otpCode: z.string().nullable().optional(),
    qrToken: z.string().nullable().optional(),
    notes: z.string().trim().min(1, 'driver.validation.note').max(500, 'driver.validation.noteTooLong'),
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
