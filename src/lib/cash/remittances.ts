import { z } from '@/lib/zod';

// Weekly cash remittance, driver → operator → manager (migration 0048).
// The database computes every balance and decides every submission; these
// schemas only shape what the forms send it, and reject obvious mistakes
// before a round trip.

// "12", "12.5", "12.50": digits, an optional point, at most two decimals.
// No signs, exponents, commas, "Infinity" or "NaN".
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

export const cashAmountSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? '0' : value))
  .pipe(z.string().regex(AMOUNT_PATTERN, 'cash.validation.amount'))
  .transform(Number);

// Money is compared and added in whole fils, never as floats.
export const toFils = (aed: number) => Math.round(aed * 100);
export const addAed = (...amounts: number[]) => amounts.reduce((sum, amount) => sum + toFils(amount), 0) / 100;

const note = z.string().trim().max(500, 'cash.validation.noteTooLong').optional();

export const remittanceSubmissionSchema = z
  .object({
    codAmount: cashAmountSchema,
    feeAmount: cashAmountSchema,
    note,
    // One per form opening, reused on retries: the database returns the
    // first remittance instead of recording it twice.
    requestId: z.string().uuid(),
  })
  .refine((value) => toFils(value.codAmount) + toFils(value.feeAmount) > 0, {
    path: ['codAmount'],
    message: 'cash.validation.nothing',
  });

export type RemittanceSubmissionInput = z.input<typeof remittanceSubmissionSchema>;

export const remittanceConfirmationSchema = z.object({
  remittanceId: z.string().uuid(),
  // What was physically counted, per category. Less than submitted is a
  // discrepancy and needs a reason (checked again in the database).
  receivedCod: cashAmountSchema,
  receivedFee: cashAmountSchema,
  note,
});

export type RemittanceConfirmationInput = z.input<typeof remittanceConfirmationSchema>;

export const remittanceDisputeSchema = z.object({
  remittanceId: z.string().uuid(),
  reason: z.string().trim().min(5, 'cash.validation.disputeReason').max(500, 'cash.validation.noteTooLong'),
});

export type RemittanceDisputeInput = z.input<typeof remittanceDisputeSchema>;

export const REMITTANCE_VIEWS = ['all', 'pending', 'confirmed', 'disputed'] as const;
export type RemittanceView = (typeof REMITTANCE_VIEWS)[number];

export const parseRemittanceView = (value: string | string[] | undefined, fallback: RemittanceView = 'all'): RemittanceView => {
  const view = (Array.isArray(value) ? value[0] : value) as RemittanceView;
  return REMITTANCE_VIEWS.includes(view) ? view : fallback;
};

export type SubmitResult = { number: string; status: string; amount: number };
export type ConfirmResult = { status: 'confirmed' | 'discrepancy'; number: string; confirmedAmount: number; countedNumber: string | null };
