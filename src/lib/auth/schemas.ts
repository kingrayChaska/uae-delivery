import { z } from '@/lib/zod';

// Messages are translation keys (messages/*/validation.json), shown in the
// reader's language by FieldError.

const password = z
  .string()
  .min(8, 'validation.passwordMin')
  .regex(/[a-z]/, 'validation.passwordLowercase')
  .regex(/[A-Z]/, 'validation.passwordUppercase')
  .regex(/[0-9]/, 'validation.passwordNumber');

export const registerSchema = z
  .object({
    fullName: z.string().min(2, 'validation.fullName'),
    email: z.string().email('validation.email'),
    phone: z.string().min(7, 'validation.phone'),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('validation.email'),
  password: z.string().min(1, 'validation.passwordRequired'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('validation.email'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().min(2, 'validation.fullName'),
  phone: z.string().min(7, 'validation.phone'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
