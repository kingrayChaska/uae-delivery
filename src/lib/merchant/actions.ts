"use server";

import { revalidatePath } from "next/cache";
import { createTranslator } from "next-intl";

import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { safeErrorMessage } from "@/lib/security/errors";
import { RATE_LIMIT_MESSAGE, checkRateLimit } from "@/lib/security/rate-limit";
import { getPublicOrigin } from "@/lib/auth/public-url";
import { sendEmail } from "@/lib/notifications/email";
import { INTL_LOCALES } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import {
  EDITABLE_MERCHANT_STATUSES,
  merchantApplicationSchema,
  merchantReviewSchema,
} from "@/lib/merchant/schemas";

import type {
  MerchantApplicationInput,
  MerchantReviewInput,
} from "@/lib/merchant/schemas";
import type { MerchantStatus } from "@/lib/types";
import type { Locale } from "@/i18n/config";
import type { EmailContent } from "@/lib/notifications/email";

export type MerchantActionResult =
  | { success: true; redirectTo?: string }
  | { success: false; error: string };

// "How will you use ParcelLink?" → Individual. Only the choice's timestamp
// is recorded; account_type itself can't be changed from a client session
// (prevent_profile_privilege_escalation, migration 0022).
export const chooseIndividualAccountAction =
  async (): Promise<MerchantActionResult> => {
    const profile = await requireRole("customer");
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ account_type_selected_at: new Date().toISOString() })
      .eq("id", profile.id);
    if (error) return { success: false, error: safeErrorMessage(error) };
    return { success: true, redirectTo: "/dashboard/customer" };
  };

const toRow = (data: MerchantApplicationInput) => ({
  company_name: data.companyName,
  registration_number: data.licenseNumber,
  license_number: data.licenseNumber,
  company_address: data.companyAddress,
  country: data.country,
  city: data.city,
  company_phone: data.companyPhone,
  business_email: data.businessEmail,
  website: data.website || null,
  contact_name: data.contactName,
  contact_position: data.contactPosition,
  contact_phone: data.contactPhone,
  contact_email: data.contactEmail,
  business_category: data.businessCategory,
  monthly_shipment_volume: data.monthlyShipmentVolume,
  pickup_address: data.pickupAddress,
  needs_cod: data.needsCod,
  notes: data.notes,
  trade_license_path: data.tradeLicensePath,
});

// Submits a first application, or resubmits one a manager sent back. The
// status is always 'pending' afterwards — approval can only come from
// review_merchant_application(). RLS and the update trigger enforce the
// same rules if this action is bypassed.
export const submitMerchantApplicationAction = async (
  input: MerchantApplicationInput,
): Promise<MerchantActionResult> => {
  const profile = await requireRole("customer");
  if (profile.accountType === "merchant")
    return { success: false, error: "merchant.errors.alreadyMerchant" };
  if (!(await checkRateLimit("merchantApplyPerUser", profile.id)))
    return { success: false, error: RATE_LIMIT_MESSAGE };

  const parsed = merchantApplicationSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "merchant.errors.checkFields",
    };
  if (
    parsed.data.tradeLicensePath &&
    !parsed.data.tradeLicensePath.startsWith(`${profile.id}/`)
  ) {
    return { success: false, error: "merchant.errors.uploadAgain" };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("merchant_applications")
    .select("id, status")
    .eq("profile_id", profile.id)
    .maybeSingle();

  let applicationId: string;
  if (!existing) {
    const { data, error } = await supabase
      .from("merchant_applications")
      .insert({ profile_id: profile.id, ...toRow(parsed.data) })
      .select("id")
      .single();
    if (error || !data)
      return {
        success: false,
        error: safeErrorMessage(error, "merchant.errors.submitFailed"),
      };
    applicationId = data.id;
  } else if (
    EDITABLE_MERCHANT_STATUSES.includes(existing.status as MerchantStatus)
  ) {
    const { error } = await supabase
      .from("merchant_applications")
      .update({ ...toRow(parsed.data), status: "pending" })
      .eq("id", existing.id);
    if (error)
      return {
        success: false,
        error: safeErrorMessage(error, "merchant.errors.resubmitFailed"),
      };
    applicationId = existing.id;
  } else {
    return { success: false, error: "merchant.errors.underReview" };
  }

  if (!profile.accountTypeSelectedAt) {
    await supabase
      .from("profiles")
      .update({ account_type_selected_at: new Date().toISOString() })
      .eq("id", profile.id);
  }

  await logAuditEvent({
    actorId: profile.id,
    action: existing ? "merchant.resubmit" : "merchant.apply",
    entityType: "merchant_application",
    entityId: applicationId,
    newValue: { companyName: parsed.data.companyName },
  });

  revalidatePath("/dashboard/customer", "layout");
  return {
    success: true,
    redirectTo: "/dashboard/customer/merchant?submitted=1",
  };
};

// The decision email, in one language (messages/*/merchant.json, emails.*).
// We don't know which language the applicant reads, so it's sent in both.
const decisionEmail = async (
  locale: Locale,
  decision: MerchantReviewInput["decision"],
  { name, note, company }: { name: string; note: string; company: string },
): Promise<EmailContent> => {
  const t = createTranslator({
    locale: INTL_LOCALES[locale],
    messages: await loadMessages(locale),
    namespace: "merchant.emails",
  });
  const body = t(`${decision}.body`, { note });
  return {
    subject: t(`${decision}.subject`),
    text: [
      name ? t("greeting", { name }) : t("greetingFallback"),
      decision === "approved" && note
        ? `${body}\n\n${t("approved.note", { note })}`
        : body,
      t("company", { company }),
    ].join("\n\n"),
    actionLabel: t(`${decision}.action`),
    footer: t("footer"),
  };
};

export const reviewMerchantApplicationAction = async (
  input: MerchantReviewInput,
): Promise<MerchantActionResult> => {
  const manager = await requireRole("manager");
  const parsed = merchantReviewSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? "merchant.errors.invalidDecision",
    };
  const { applicationId, decision, note } = parsed.data;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("merchant_applications")
    .select(
      "status, company_name, profile_id, profiles!merchant_applications_profile_id_fkey(email, full_name)",
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (!before) return { success: false, error: "merchant.errors.notFound" };

  // The database function does the real work — and re-checks that the
  // caller is a manager — in one transaction: status, merchant access,
  // business account, and the in-app notification (trigger).
  const { error } = await supabase.rpc("review_merchant_application", {
    p_application_id: applicationId,
    p_decision: decision,
    p_note: note || null,
  });
  if (error)
    return {
      success: false,
      error: safeErrorMessage(error, "merchant.errors.saveDecisionFailed"),
    };

  await logAuditEvent({
    actorId: manager.id,
    action: `merchant.${decision}`,
    entityType: "merchant_application",
    entityId: applicationId,
    oldValue: { status: before.status },
    newValue: { status: decision, note },
  });

  const applicant = before.profiles as
    | { email: string; full_name: string }
    | { email: string; full_name: string }[]
    | null;
  const recipient = Array.isArray(applicant) ? applicant[0] : applicant;
  if (recipient?.email) {
    const origin = getPublicOrigin();
    const details = {
      name: recipient.full_name ?? "",
      note,
      company: before.company_name,
    };
    const [english, arabic] = await Promise.all([
      decisionEmail("en", decision, details),
      decisionEmail("ar", decision, details),
    ]);
    await sendEmail({
      to: recipient.email,
      ...english,
      arabic,
      actionUrl:
        decision === "approved"
          ? `${origin}/dashboard/customer/book`
          : `${origin}/dashboard/customer/merchant`,
    });
  }

  revalidatePath("/dashboard/manager/merchants");
  return { success: true };
};
