import { z } from '@/lib/zod';

const password = z
  .string()
  .min(8, 'manager.staff.validation.passwordMin')
  .regex(/[a-z]/, 'manager.staff.validation.passwordLowercase')
  .regex(/[A-Z]/, 'manager.staff.validation.passwordUppercase')
  .regex(/[0-9]/, 'manager.staff.validation.passwordNumber');

const optionalText = z.string().trim().optional().or(z.literal(''));

// Managers can only onboard operators and drivers. The manager role itself
// is locked at the database level (migration 0016), so it isn't even an
// option here.
export const STAFF_ROLES = ['operator', 'driver'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const createStaffSchema = z
  .object({
    role: z.enum(STAFF_ROLES),
    fullName: z.string().trim().min(2, 'manager.staff.validation.fullName'),
    email: z.string().trim().email('manager.staff.validation.email'),
    phone: z.string().trim().min(7, 'manager.staff.validation.phone'),
    method: z.enum(['invite', 'password']),
    password: z.string().optional(),
    employeeId: optionalText,
    driverCode: optionalText,
    licenseNumber: optionalText,
    licenseExpiry: optionalText,
    vehicleType: optionalText,
    vehicleMake: optionalText,
    vehicleModel: optionalText,
    plateNumber: optionalText,
    registrationNumber: optionalText,
  })
  .superRefine((data, ctx) => {
    if (data.method === 'password') {
      const result = password.safeParse(data.password ?? '');
      if (!result.success) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: result.error.issues[0]?.message ?? 'manager.staff.validation.password' });
      }
    }
    if (data.role === 'operator' && !data.employeeId) {
      ctx.addIssue({ code: 'custom', path: ['employeeId'], message: 'manager.staff.validation.employeeId' });
    }
    if (data.role === 'driver') {
      if (!data.driverCode) ctx.addIssue({ code: 'custom', path: ['driverCode'], message: 'manager.staff.validation.driverId' });
      if (!data.licenseNumber) {
        ctx.addIssue({ code: 'custom', path: ['licenseNumber'], message: 'manager.staff.validation.licenseNumber' });
      }
      const vehicleFields = [data.vehicleType, data.vehicleMake, data.vehicleModel, data.plateNumber, data.registrationNumber];
      const anyVehicle = vehicleFields.some(Boolean);
      if (anyVehicle && !vehicleFields.every(Boolean)) {
        ctx.addIssue({ code: 'custom', path: ['plateNumber'], message: 'manager.staff.validation.vehicle' });
      }
    }
  });

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z.object({
  profileId: z.string().uuid(),
  fullName: z.string().trim().min(2, 'manager.staff.validation.fullName'),
  phone: z.string().trim().min(7, 'manager.staff.validation.phone'),
  employeeId: optionalText,
  driverCode: optionalText,
  licenseNumber: optionalText,
});

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
