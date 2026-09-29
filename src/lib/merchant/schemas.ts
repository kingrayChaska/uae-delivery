import { z } from '@/lib/zod';
import { msg, ref } from '@/i18n/message';

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

// The categories are stored as these English phrases; each has a
// translation key for display (merchant.categories.<key>).
export const BUSINESS_CATEGORY_KEYS: Record<(typeof BUSINESS_CATEGORIES)[number], string> = {
  'Retail & e-commerce': 'retail',
  'Food & groceries': 'food',
  'Health & beauty': 'health',
  Electronics: 'electronics',
  'Fashion & apparel': 'fashion',
  'Documents & legal': 'documents',
  'Pharmacy & medical': 'pharmacy',
  'Wholesale & distribution': 'wholesale',
  Other: 'other',
};

export const MONTHLY_VOLUMES = ['1-50', '51-200', '201-500', '501-2000', '2000+'] as const;

// Messages are translation keys (merchant.validation.*), naming the field
// in the reader's language.
type FieldKey =
  | 'companyName' | 'registrationNumber' | 'licenseNumber' | 'companyAddress' | 'country' | 'city' | 'companyPhone'
  | 'businessEmail' | 'contactName' | 'contactPosition' | 'contactPhone' | 'contactEmail' | 'pickupAddress';

const field = (key: FieldKey) => ref(`merchant.fields.${key}`);

const text = (key: FieldKey, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, msg('merchant.validation.required', { field: field(key) }))
    .max(max, msg('merchant.validation.tooLong', { field: field(key), max }));

const phone = (key: FieldKey) =>
  z
    .string()
    .trim()
    .min(7, msg('merchant.validation.phone', { field: field(key) }))
    .max(25, msg('merchant.validation.phone', { field: field(key) }))
    .regex(/^[+\d][\d\s()-]*$/, msg('merchant.validation.phone', { field: field(key) }));

const email = (key: FieldKey) => z.string().trim().max(160).email(msg('merchant.validation.email', { field: field(key) }));

// Mirrors the CHECK constraints on merchant_applications (migration 0022).
export const merchantApplicationSchema = z.object({
  companyName: text('companyName', 2, 160),
  registrationNumber: text('registrationNumber', 2, 60),
  licenseNumber: text('licenseNumber', 2, 60),
  companyAddress: text('companyAddress', 5, 300),
  country: text('country', 2, 60),
  city: text('city', 2, 80),
  companyPhone: phone('companyPhone'),
  businessEmail: email('businessEmail'),
  website: z
    .string()
    .trim()
    .max(200, 'merchant.validation.websiteTooLong')
    .refine((value) => value === '' || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(value), 'merchant.validation.website'),

  contactName: text('contactName', 2, 120),
  contactPosition: text('contactPosition', 2, 80),
  contactPhone: phone('contactPhone'),
  contactEmail: email('contactEmail'),

  businessCategory: z.enum(BUSINESS_CATEGORIES, { error: 'merchant.validation.category' }),
  monthlyShipmentVolume: z.enum(MONTHLY_VOLUMES, { error: 'merchant.validation.volume' }),
  pickupAddress: text('pickupAddress', 5, 300),
  needsCod: z.boolean(),
  notes: z.string().trim().max(1000, 'merchant.validation.notesTooLong'),
  tradeLicensePath: z.string().max(300).nullable(),
  // Confirms the details are accurate — required to submit.
  confirmAccuracy: z.literal(true, { error: 'merchant.validation.confirm' }),
});

export type MerchantApplicationInput = z.infer<typeof merchantApplicationSchema>;

export const merchantReviewSchema = z
  .object({
    applicationId: z.string().uuid(),
    decision: z.enum(['approved', 'rejected', 'requires_changes']),
    note: z.string().trim().max(1000, 'merchant.validation.reviewNoteTooLong'),
  })
  .refine((value) => value.decision === 'approved' || value.note.length >= 5, {
    path: ['note'],
    message: 'merchant.validation.reviewNoteRequired',
  });

export type MerchantReviewInput = z.infer<typeof merchantReviewSchema>;

// Labels: merchant.status.<status>.
export const MERCHANT_STATUS_TONE: Record<MerchantStatus, 'default' | 'success' | 'warning' | 'destructive'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  requires_changes: 'warning',
};

// Statuses from which the applicant may edit and resubmit (enforced by the
// merchant_applications_enforce_update trigger).
export const EDITABLE_MERCHANT_STATUSES: MerchantStatus[] = ['requires_changes', 'rejected'];
