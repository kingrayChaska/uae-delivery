import { z } from '@/lib/zod';

import type { MerchantStatus } from '@/lib/types';

export const BUSINESS_CATEGORIES = [
  'Retail & e-commerce',
  'Food & groceries',
  'Health & beauty',
  'Electronics',
  'Fashion & apparel',
  'Documents & legal',
  'Pharmacy & medical',
  'Wholesale & distribution',
  'Other',
] as const;

export const MONTHLY_VOLUMES = ['1-50', '51-200', '201-500', '501-2000', '2000+'] as const;

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min <= 1 ? `Enter the ${label}` : `Enter the ${label}`)
    .max(max, `Keep the ${label} under ${max} characters`);

const phone = (label: string) =>
  z
    .string()
    .trim()
    .min(7, `Enter a valid ${label}`)
    .max(25, `Enter a valid ${label}`)
    .regex(/^[+\d][\d\s()-]*$/, `Enter a valid ${label}`);

const email = (label: string) => z.string().trim().max(160).email(`Enter a valid ${label}`);

// Mirrors the CHECK constraints on merchant_applications (migration 0022).
export const merchantApplicationSchema = z.object({
  companyName: text('company name', 2, 160),
  registrationNumber: text('company registration number', 2, 60),
  licenseNumber: text('trade licence number', 2, 60),
  companyAddress: text('company address', 5, 300),
  country: text('country', 2, 60),
  city: text('city', 2, 80),
  companyPhone: phone('company phone number'),
  businessEmail: email('business email'),
  website: z
    .string()
    .trim()
    .max(200, 'Keep the website under 200 characters')
    .refine((value) => value === '' || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(value), 'Enter a valid website address'),

  contactName: text('contact person’s full name', 2, 120),
  contactPosition: text('contact person’s position', 2, 80),
  contactPhone: phone('contact phone number'),
  contactEmail: email('contact email'),

  businessCategory: z.enum(BUSINESS_CATEGORIES, { error: 'Choose a business category' }),
  monthlyShipmentVolume: z.enum(MONTHLY_VOLUMES, { error: 'Choose your expected monthly shipments' }),
  pickupAddress: text('main pickup / warehouse address', 5, 300),
  needsCod: z.boolean(),
  notes: z.string().trim().max(1000, 'Keep notes under 1000 characters'),
  tradeLicensePath: z.string().max(300).nullable(),
  // Confirms the details are accurate — required to submit.
  confirmAccuracy: z.literal(true, { error: 'Confirm that these details are accurate' }),
});

export type MerchantApplicationInput = z.infer<typeof merchantApplicationSchema>;

export const merchantReviewSchema = z
  .object({
    applicationId: z.string().uuid(),
    decision: z.enum(['approved', 'rejected', 'requires_changes']),
    note: z.string().trim().max(1000, 'Keep the message under 1000 characters'),
  })
  .refine((value) => value.decision === 'approved' || value.note.length >= 5, {
    path: ['note'],
    message: 'Tell the applicant why (at least a few words)',
  });

export type MerchantReviewInput = z.infer<typeof merchantReviewSchema>;

export const MERCHANT_STATUS_COPY: Record<MerchantStatus, { label: string; tone: 'default' | 'success' | 'warning' | 'destructive' }> = {
  pending: { label: 'Pending approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'destructive' },
  requires_changes: { label: 'Requires changes', tone: 'warning' },
};

// Statuses from which the applicant may edit and resubmit (enforced by the
// merchant_applications_enforce_update trigger).
export const EDITABLE_MERCHANT_STATUSES: MerchantStatus[] = ['requires_changes', 'rejected'];
