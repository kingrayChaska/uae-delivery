import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import MerchantApplicationForm from "@/components/merchant/merchant-application-form";
import { requireRoleOrRedirect } from "@/lib/auth/require-role-or-redirect";
import { EDITABLE_MERCHANT_STATUSES } from "@/lib/merchant/schemas";
import { getOwnMerchantApplication } from "@/services/merchant/applications";

import type { Metadata } from "next";
import type { MerchantApplicationInput } from "@/lib/merchant/schemas";

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations("merchant.apply"))("meta"),
});

const MerchantApplyPage = async () => {
  const profile = await requireRoleOrRedirect("customer");
  if (profile.accountType === "merchant")
    redirect("/dashboard/customer/merchant");

  const [application, t] = await Promise.all([
    getOwnMerchantApplication(profile.id),
    getTranslations("merchant.apply"),
  ]);
  // A pending application can't be edited while it's being reviewed.
  if (application && !EDITABLE_MERCHANT_STATUSES.includes(application.status))
    redirect("/dashboard/customer/merchant");

  const defaults: Partial<MerchantApplicationInput> = application
    ? {
        companyName: application.companyName,
        licenseNumber: application.licenseNumber,
        companyAddress: application.companyAddress,
        country: application.country,
        city: application.city,
        companyPhone: application.companyPhone,
        businessEmail: application.businessEmail,
        website: application.website ?? "",
        contactName: application.contactName,
        contactPosition: application.contactPosition,
        contactPhone: application.contactPhone,
        contactEmail: application.contactEmail,
        businessCategory:
          application.businessCategory as MerchantApplicationInput["businessCategory"],
        monthlyShipmentVolume:
          application.monthlyShipmentVolume as MerchantApplicationInput["monthlyShipmentVolume"],
        pickupAddress: application.pickupAddress,
        needsCod: application.needsCod,
        notes: application.notes,
        tradeLicensePath: application.tradeLicensePath,
      }
    : {
        contactName: profile.fullName,
        contactEmail: profile.email,
        contactPhone: profile.phone,
      };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <Link
        href="/dashboard/customer/merchant"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {application ? t("titleUpdate") : t("titleNew")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {application?.reviewNote ? (
        <div
          role="note"
          className="flex items-start gap-3 rounded-2xl border border-warning/60 bg-warning/10 p-4 text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{t("teamMessage")}</p>
            <p>{application.reviewNote}</p>
          </div>
        </div>
      ) : null}

      <MerchantApplicationForm
        profileId={profile.id}
        defaults={defaults}
        isResubmission={Boolean(application)}
      />
    </main>
  );
};

export default MerchantApplyPage;
