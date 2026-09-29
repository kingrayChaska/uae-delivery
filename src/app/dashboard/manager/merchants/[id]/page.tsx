import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";

import Button from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import MerchantStatusBadge from "@/components/merchant/merchant-status-badge";
import MerchantReviewPanel from "@/components/merchant/merchant-review-panel";
import { requireRoleOrRedirect } from "@/lib/auth/require-role-or-redirect";
import { isUuid } from "@/lib/security/validate";
import { BUSINESS_CATEGORY_KEYS } from "@/lib/merchant/schemas";
import { getMerchantApplication } from "@/services/merchant/applications";
import { getFormat } from "@/i18n/server";

import type { ReactNode } from "react";

const Detail = ({
  label,
  children,
  ltr = false,
}: {
  label: string;
  children: ReactNode;
  ltr?: boolean;
}) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd
      dir={ltr ? "ltr" : undefined}
      className={`wrap-break-word text-sm font-medium ${ltr ? "rtl:text-right" : ""}`}
    >
      {children}
    </dd>
  </div>
);

const MerchantApplicationPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  await requireRoleOrRedirect("manager");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const application = await getMerchantApplication(id);
  if (!application) notFound();

  const [t, tMerchant, tCommon, format] = await Promise.all([
    getTranslations("manager.merchants"),
    getTranslations("merchant"),
    getTranslations("common.yesNo"),
    getFormat(),
  ]);
  const website = application.website
    ? application.website.startsWith("http")
      ? application.website
      : `https://${application.website}`
    : null;
  const categoryKey =
    BUSINESS_CATEGORY_KEYS[
      application.businessCategory as keyof typeof BUSINESS_CATEGORY_KEYS
    ];

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Link
        href="/dashboard/manager/merchants"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{application.companyName}</h1>
          <p className="text-sm text-muted-foreground">
            {t("appliedBy", {
              name: application.applicantName,
              email: application.applicantEmail,
              date: format.dateTime(application.submittedAt),
            })}
          </p>
        </div>
        <MerchantStatusBadge status={application.status} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <h2 className="font-semibold">{t("decision")}</h2>
          {application.reviewedAt ? (
            <p className="text-sm text-muted-foreground">
              {application.reviewerName
                ? t("lastReviewedBy", {
                    date: format.dateTime(application.reviewedAt),
                    name: application.reviewerName,
                  })
                : t("lastReviewed", {
                    date: format.dateTime(application.reviewedAt),
                  })}
              {application.reviewNote
                ? t("reviewNote", { note: application.reviewNote })
                : ""}
            </p>
          ) : null}
          <MerchantReviewPanel
            applicationId={application.id}
            status={application.status}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <h2 className="font-semibold">{t("company")}</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label={t("registrationNumber")} ltr>
                {application.registrationNumber}
              </Detail>
              <Detail label={t("licenseNumber")} ltr>
                {application.licenseNumber}
              </Detail>
              <Detail label={t("address")}>{application.companyAddress}</Detail>
              <Detail label={t("cityCountry")}>
                {t("place", {
                  city: application.city,
                  country: application.country,
                })}
              </Detail>
              <Detail label={t("phone")} ltr>
                {application.companyPhone}
              </Detail>
              <Detail label={t("businessEmail")} ltr>
                {application.businessEmail}
              </Detail>
              <Detail label={t("website")}>
                {website ? (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    dir="ltr"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {application.website}
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  "—"
                )}
              </Detail>
            </dl>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                {t("licenseDocument")}
              </p>
              {application.tradeLicenseUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={application.tradeLicenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileText aria-hidden />
                    {t("openDocument")}
                  </a>
                </Button>
              ) : (
                <p className="text-sm">{t("notUploaded")}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <h2 className="font-semibold">{t("contact")}</h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label={t("name")}>{application.contactName}</Detail>
                <Detail label={t("position")}>
                  {application.contactPosition}
                </Detail>
                <Detail label={t("phone")} ltr>
                  {application.contactPhone}
                </Detail>
                <Detail label={t("email")} ltr>
                  {application.contactEmail}
                </Detail>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <h2 className="font-semibold">{t("shipping")}</h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label={t("category")}>
                  {categoryKey
                    ? tMerchant(`categories.${categoryKey as "retail"}`)
                    : application.businessCategory}
                </Detail>
                <Detail label={t("volume")} ltr>
                  {application.monthlyShipmentVolume}
                </Detail>
                <Detail label={t("pickup")}>{application.pickupAddress}</Detail>
                <Detail label={t("needsCod")}>
                  {application.needsCod ? tCommon("yes") : tCommon("no")}
                </Detail>
              </dl>
              {application.notes ? (
                <Detail label={t("notes")}>{application.notes}</Detail>
              ) : null}
            </CardContent>
          </Card>
          {application.businessAccountId ? (
            <Button asChild variant="outline" className="self-start">
              <Link
                href={`/dashboard/manager/business-accounts/${application.businessAccountId}`}
              >
                {t("viewBusiness")}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  );
};

export default MerchantApplicationPage;
