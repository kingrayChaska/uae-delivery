"use client";

import {
  Building2,
  FileCheck2,
  Send,
  Trash2,
  UserRound,
  Warehouse,
} from "lucide-react";
import { useTranslations } from "next-intl";

import Button from "@/components/ui/button";
import Checkbox from "@/components/ui/checkbox";
import Label from "@/components/ui/label";
import Select from "@/components/ui/select";
import FieldError from "@/components/ui/field-error";
import Field from "@/components/manager/field";
import {
  BUSINESS_CATEGORIES,
  BUSINESS_CATEGORY_KEYS,
  MONTHLY_VOLUMES,
} from "@/lib/merchant/schemas";
import { useMerchantApplicationForm } from "@/lib/hooks/use-merchant-application-form";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { MerchantApplicationInput } from "@/lib/merchant/schemas";

const Section = ({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <fieldset className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
    <legend className="sr-only">{title}</legend>
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
    {children}
  </fieldset>
);

type MerchantApplicationFormProps = {
  profileId: string;
  defaults: Partial<MerchantApplicationInput>;
  isResubmission: boolean;
};

const MerchantApplicationForm = ({
  profileId,
  defaults,
  isResubmission,
}: MerchantApplicationFormProps) => {
  const t = useTranslations("merchant");
  const {
    form,
    onSubmit,
    serverError,
    isSubmitting,
    uploadLicense,
    removeLicense,
    isUploading,
    uploadError,
    fileName,
  } = useMerchantApplicationForm(profileId, defaults);
  const { register, formState } = form;
  const { errors } = formState;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Section
        icon={Building2}
        title={t("form.company.title")}
        description={t("form.company.description")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="companyName"
            label={t("form.companyName")}
            autoComplete="organization"
            error={errors.companyName?.message}
            {...register("companyName")}
          />
          <Field
            id="licenseNumber"
            label={t("form.licenseNumber")}
            error={errors.licenseNumber?.message}
            {...register("licenseNumber")}
          />
          <Field
            id="website"
            label={t("form.website")}
            type="url"
            inputMode="url"
            dir="ltr"
            className="rtl:text-right"
            placeholder={t("form.websitePlaceholder")}
            error={errors.website?.message}
            {...register("website")}
          />
          <div className="sm:col-span-2">
            <Field
              id="companyAddress"
              label={t("form.companyAddress")}
              autoComplete="street-address"
              error={errors.companyAddress?.message}
              {...register("companyAddress")}
            />
          </div>
          <Field
            id="city"
            label={t("form.city")}
            autoComplete="address-level2"
            error={errors.city?.message}
            {...register("city")}
          />
          <Field
            id="country"
            label={t("form.country")}
            autoComplete="country-name"
            error={errors.country?.message}
            {...register("country")}
          />
          <Field
            id="companyPhone"
            label={t("form.companyPhone")}
            type="tel"
            inputMode="tel"
            dir="ltr"
            className="rtl:text-right"
            error={errors.companyPhone?.message}
            {...register("companyPhone")}
          />
          <Field
            id="businessEmail"
            label={t("form.businessEmail")}
            type="email"
            autoComplete="email"
            dir="ltr"
            className="rtl:text-right"
            error={errors.businessEmail?.message}
            {...register("businessEmail")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tradeLicense">{t("form.tradeLicense")}</Label>
          {fileName ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
              <FileCheck2 className="size-4 text-success" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{fileName}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={removeLicense}
              >
                <Trash2 aria-hidden />
                {t("form.remove")}
              </Button>
            </div>
          ) : (
            <input
              id="tradeLicense"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={isUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadLicense(file);
              }}
              className="text-sm text-muted-foreground file:me-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:text-sm file:font-medium file:text-secondary-foreground"
            />
          )}
          {isUploading ? (
            <p className="text-xs text-muted-foreground" role="status">
              {t("form.uploading")}
            </p>
          ) : null}
          <FieldError message={uploadError ?? undefined} />
        </div>
      </Section>

      <Section
        icon={UserRound}
        title={t("form.contact.title")}
        description={t("form.contact.description")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="contactName"
            label={t("form.contactName")}
            autoComplete="name"
            error={errors.contactName?.message}
            {...register("contactName")}
          />
          <Field
            id="contactPosition"
            label={t("form.contactPosition")}
            autoComplete="organization-title"
            error={errors.contactPosition?.message}
            {...register("contactPosition")}
          />
          <Field
            id="contactPhone"
            label={t("form.contactPhone")}
            type="tel"
            inputMode="tel"
            dir="ltr"
            className="rtl:text-right"
            autoComplete="tel"
            error={errors.contactPhone?.message}
            {...register("contactPhone")}
          />
          <Field
            id="contactEmail"
            label={t("form.contactEmail")}
            type="email"
            autoComplete="email"
            dir="ltr"
            className="rtl:text-right"
            error={errors.contactEmail?.message}
            {...register("contactEmail")}
          />
        </div>
      </Section>

      <Section
        icon={Warehouse}
        title={t("form.shipping.title")}
        description={t("form.shipping.description")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="businessCategory">{t("form.category")}</Label>
            <Select
              id="businessCategory"
              aria-invalid={Boolean(errors.businessCategory) || undefined}
              {...register("businessCategory")}
            >
              <option value="" disabled>
                {t("form.categoryPlaceholder")}
              </option>
              {BUSINESS_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {t(
                    `categories.${BUSINESS_CATEGORY_KEYS[category] as "retail"}`,
                  )}
                </option>
              ))}
            </Select>
            <FieldError message={errors.businessCategory?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthlyShipmentVolume">{t("form.volume")}</Label>
            <Select
              id="monthlyShipmentVolume"
              aria-invalid={Boolean(errors.monthlyShipmentVolume) || undefined}
              {...register("monthlyShipmentVolume")}
            >
              <option value="" disabled>
                {t("form.volumePlaceholder")}
              </option>
              {MONTHLY_VOLUMES.map((volume) => (
                <option key={volume} value={volume}>
                  {volume}
                </option>
              ))}
            </Select>
            <FieldError message={errors.monthlyShipmentVolume?.message} />
          </div>
          <div className="sm:col-span-2">
            <Field
              id="pickupAddress"
              label={t("form.pickupAddress")}
              error={errors.pickupAddress?.message}
              {...register("pickupAddress")}
            />
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <Checkbox className="size-5" {...register("needsCod")} />
          {t("form.needsCod")}
        </label>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">{t("form.notes")}</Label>
          <textarea
            id="notes"
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
            {...register("notes")}
          />
          <FieldError message={errors.notes?.message} />
        </div>
      </Section>

      <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary/20 bg-secondary/30 p-4 sm:p-6">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            className="mt-0.5 size-5"
            {...register("confirmAccuracy")}
          />
          {t("form.confirm")}
        </label>
        <FieldError message={errors.confirmAccuracy?.message} />
        {serverError ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/5 p-3"
          >
            <FieldError message={serverError} />
          </div>
        ) : null}
        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          loadingText={t("form.submitting")}
          disabled={isUploading}
          className="self-start"
        >
          <Send aria-hidden />
          {isResubmission ? t("form.resubmit") : t("form.submit")}
        </Button>
      </div>
    </form>
  );
};

export default MerchantApplicationForm;
