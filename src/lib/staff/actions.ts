"use server";

import { requireRole } from "@/lib/auth/guards";
import { isUuid } from "@/lib/security/validate";
import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/security/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import { RATE_LIMIT_MESSAGE, checkRateLimit } from "@/lib/security/rate-limit";
import { createStaffSchema, updateStaffSchema } from "@/lib/staff/schemas";
import { getPublicOrigin } from "@/lib/auth/public-url";

import type { CreateStaffInput, UpdateStaffInput } from "@/lib/staff/schemas";

export type StaffActionResult =
  | { success: true; profileId?: string }
  | { success: false; error: string };

const getAppUrl = () => getPublicOrigin();

const friendlyDbError = (message: string) => {
  if (message.includes("staff_profiles_employee_id_key"))
    return "That employee ID is already in use";
  if (message.includes("driver_profiles_driver_code_key"))
    return "That driver ID is already in use";
  if (message.includes("vehicles_plate_number_key"))
    return "A vehicle with that plate number already exists";
  if (message.toLowerCase().includes("already been registered"))
    return "An account with that email already exists";
  return "Could not complete the request. Please check the details and try again.";
};

// Staff onboarding runs with the service-role client because it has to
// create an auth user and set a non-customer role — neither of which any
// client session may do (migrations 0002/0016). requireRole('manager') is
// what authorizes it, and only 'operator' | 'driver' are accepted by the
// schema. If any step after auth-user creation fails, the auth user is
// deleted again (cascading to profile/staff rows) so a half-created
// account never lingers.
export const createStaffAction = async (
  input: CreateStaffInput,
): Promise<StaffActionResult> => {
  const manager = await requireRole("manager");
  if (!(await checkRateLimit("staffCreatePerUser", manager.id)))
    return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = createStaffSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const data = parsed.data;
  const admin = createAdminClient();
  const metadata = { full_name: data.fullName, phone: data.phone };

  const created =
    data.method === "invite"
      ? await admin.auth.admin.inviteUserByEmail(data.email, {
          data: metadata,
          redirectTo: `${getAppUrl()}/auth/confirm`,
        })
      : await admin.auth.admin.createUser({
          email: data.email,
          password: data.password,
          email_confirm: true,
          user_metadata: metadata,
        });

  if (created.error || !created.data.user) {
    return {
      success: false,
      error: friendlyDbError(
        created.error?.message ?? "Could not create the account",
      ),
    };
  }

  const userId = created.data.user.id;
  let vehicleId: string | null = null;

  const rollback = async () => {
    if (vehicleId) await admin.from("vehicles").delete().eq("id", vehicleId);
    await admin.auth.admin.deleteUser(userId);
  };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: data.role, full_name: data.fullName, phone: data.phone })
    .eq("id", userId);
  if (profileError) {
    await rollback();
    return { success: false, error: friendlyDbError(profileError.message) };
  }

  if (data.role === "operator") {
    const { error } = await admin
      .from("staff_profiles")
      .insert({ profile_id: userId, employee_id: data.employeeId });
    if (error) {
      await rollback();
      return { success: false, error: friendlyDbError(error.message) };
    }
  } else {
    if (data.plateNumber) {
      const { data: vehicle, error } = await admin
        .from("vehicles")
        .insert({
          vehicle_type: data.vehicleType,
          make: data.vehicleMake,
          model: data.vehicleModel,
          plate_number: data.plateNumber,
          registration_number: data.registrationNumber,
        })
        .select("id")
        .single();
      if (error || !vehicle) {
        await rollback();
        return {
          success: false,
          error: friendlyDbError(
            error?.message ?? "Could not register the vehicle",
          ),
        };
      }
      vehicleId = vehicle.id;
    }

    const { error } = await admin.from("driver_profiles").insert({
      profile_id: userId,
      driver_code: data.driverCode,
      license_number: data.licenseNumber,
      license_expiry: data.licenseExpiry || null,
      vehicle_id: vehicleId,
    });
    if (error) {
      await rollback();
      return { success: false, error: friendlyDbError(error.message) };
    }
  }

  await logAuditEvent({
    actorId: manager.id,
    action: `staff.create_${data.role}`,
    entityType: "profile",
    entityId: userId,
    newValue: {
      fullName: data.fullName,
      email: data.email,
      role: data.role,
      method: data.method,
    },
  });

  return { success: true, profileId: userId };
};

// Runs under the manager's own session: RLS + the privilege-escalation
// trigger already allow a manager to edit staff display fields and
// staff/driver profile rows, so no service-role client is needed.
export const updateStaffAction = async (
  input: UpdateStaffInput,
): Promise<StaffActionResult> => {
  const manager = await requireRole("manager");
  const parsed = updateStaffSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const data = parsed.data;
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.profileId)
    .maybeSingle();
  if (!target || !["operator", "driver"].includes(target.role)) {
    return { success: false, error: "Staff member not found" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: data.fullName, phone: data.phone })
    .eq("id", data.profileId);
  if (error) return { success: false, error: safeErrorMessage(error) };

  if (target.role === "operator" && data.employeeId) {
    const { error: staffError } = await supabase
      .from("staff_profiles")
      .update({ employee_id: data.employeeId })
      .eq("profile_id", data.profileId);
    if (staffError)
      return { success: false, error: friendlyDbError(staffError.message) };
  }

  if (target.role === "driver") {
    const { error: driverError } = await supabase
      .from("driver_profiles")
      .update({
        ...(data.driverCode ? { driver_code: data.driverCode } : {}),
        ...(data.licenseNumber ? { license_number: data.licenseNumber } : {}),
      })
      .eq("profile_id", data.profileId);
    if (driverError)
      return { success: false, error: friendlyDbError(driverError.message) };
  }

  await logAuditEvent({
    actorId: manager.id,
    action: "staff.update",
    entityType: "profile",
    entityId: data.profileId,
    newValue: { fullName: data.fullName, phone: data.phone },
  });

  return { success: true };
};

// Deactivation does two things: flips profiles.active (which the app's
// auth checks read) AND bans the auth user, so an existing session token
// can't keep being refreshed. Reactivation reverses both.
export const setStaffActiveAction = async (
  profileId: string,
  active: boolean,
): Promise<StaffActionResult> => {
  if (!isUuid(profileId)) return { success: false, error: "Not found" };
  const manager = await requireRole("manager");
  if (profileId === manager.id)
    return { success: false, error: "You cannot deactivate your own account" };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .maybeSingle();
  if (!target || !["operator", "driver"].includes(target.role)) {
    return { success: false, error: "Staff member not found" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ active })
    .eq("id", profileId);
  if (error) return { success: false, error: safeErrorMessage(error) };

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(profileId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError)
    return {
      success: false,
      error: "Could not update sign-in access. Please try again.",
    };

  if (!active && target.role === "driver") {
    await supabase
      .from("driver_profiles")
      .update({ availability: "offline" })
      .eq("profile_id", profileId);
  }

  await logAuditEvent({
    actorId: manager.id,
    action: active ? "staff.activate" : "staff.deactivate",
    entityType: "profile",
    entityId: profileId,
  });

  return { success: true };
};

export const resetStaffAccessAction = async (
  profileId: string,
): Promise<StaffActionResult> => {
  if (!isUuid(profileId)) return { success: false, error: "Not found" };
  const manager = await requireRole("manager");
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", profileId)
    .maybeSingle();
  if (!target || !["operator", "driver"].includes(target.role)) {
    return { success: false, error: "Staff member not found" };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(target.email, {
    redirectTo: `${getAppUrl()}/auth/confirm`,
  });
  if (error) return { success: false, error: safeErrorMessage(error) };

  await logAuditEvent({
    actorId: manager.id,
    action: "staff.reset_access",
    entityType: "profile",
    entityId: profileId,
  });
  return { success: true };
};
