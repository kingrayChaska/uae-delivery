'use client';

import { Building2, FileCheck2, Send, Trash2, UserRound, Warehouse } from 'lucide-react';

import Button from '@/components/ui/button';
import Checkbox from '@/components/ui/checkbox';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import FieldError from '@/components/ui/field-error';
import Field from '@/components/manager/field';
import { BUSINESS_CATEGORIES, MONTHLY_VOLUMES } from '@/lib/merchant/schemas';
import { useMerchantApplicationForm } from '@/lib/hooks/use-merchant-application-form';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { MerchantApplicationInput } from '@/lib/merchant/schemas';

const Section = ({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) => (
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

const MerchantApplicationForm = ({ profileId, defaults, isResubmission }: MerchantApplicationFormProps) => {
  const { form, onSubmit, serverError, isSubmitting, uploadLicense, removeLicense, isUploading, uploadError, fileName } =
    useMerchantApplicationForm(profileId, defaults);
  const { register, formState } = form;
  const { errors } = formState;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Section icon={Building2} title="Company information" description="As shown on your trade licence.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="companyName" label="Company name" autoComplete="organization" error={errors.companyName?.message} {...register('companyName')} />
          <Field id="registrationNumber" label="Company registration number" error={errors.registrationNumber?.message} {...register('registrationNumber')} />
          <Field id="licenseNumber" label="Business / trade licence number" error={errors.licenseNumber?.message} {...register('licenseNumber')} />
          <Field id="website" label="Website (optional)" type="url" inputMode="url" placeholder="www.example.ae" error={errors.website?.message} {...register('website')} />
          <div className="sm:col-span-2">
            <Field id="companyAddress" label="Company address" autoComplete="street-address" error={errors.companyAddress?.message} {...register('companyAddress')} />
          </div>
          <Field id="city" label="City / emirate" autoComplete="address-level2" error={errors.city?.message} {...register('city')} />
          <Field id="country" label="Country" autoComplete="country-name" error={errors.country?.message} {...register('country')} />
          <Field id="companyPhone" label="Company phone" type="tel" inputMode="tel" error={errors.companyPhone?.message} {...register('companyPhone')} />
          <Field id="businessEmail" label="Business email" type="email" autoComplete="email" error={errors.businessEmail?.message} {...register('businessEmail')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tradeLicense">Trade licence (PDF or image, optional but speeds up approval)</Label>
          {fileName ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
              <FileCheck2 className="size-4 text-success" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{fileName}</span>
              <Button type="button" variant="ghost" size="sm" onClick={removeLicense}>
                <Trash2 aria-hidden />
                Remove
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
              className="text-sm text-muted-foreground file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:text-sm file:font-medium file:text-secondary-foreground"
            />
          )}
          {isUploading ? <p className="text-xs text-muted-foreground" role="status">Uploading…</p> : null}
          <FieldError message={uploadError ?? undefined} />
        </div>
      </Section>

      <Section icon={UserRound} title="Contact person" description="Who we should talk to about your account.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="contactName" label="Full name" autoComplete="name" error={errors.contactName?.message} {...register('contactName')} />
          <Field id="contactPosition" label="Position / role" autoComplete="organization-title" error={errors.contactPosition?.message} {...register('contactPosition')} />
          <Field id="contactPhone" label="Phone number" type="tel" inputMode="tel" autoComplete="tel" error={errors.contactPhone?.message} {...register('contactPhone')} />
          <Field id="contactEmail" label="Email" type="email" autoComplete="email" error={errors.contactEmail?.message} {...register('contactEmail')} />
        </div>
      </Section>

      <Section icon={Warehouse} title="Shipping profile" description="Helps us set up pickups and capacity for you.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="businessCategory">Business category</Label>
            <Select id="businessCategory" aria-invalid={Boolean(errors.businessCategory) || undefined} {...register('businessCategory')}>
              <option value="" disabled>
                Choose a category…
              </option>
              {BUSINESS_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
            <FieldError message={errors.businessCategory?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthlyShipmentVolume">Expected shipments per month</Label>
            <Select id="monthlyShipmentVolume" aria-invalid={Boolean(errors.monthlyShipmentVolume) || undefined} {...register('monthlyShipmentVolume')}>
              <option value="" disabled>
                Choose a range…
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
            <Field id="pickupAddress" label="Main pickup / warehouse address" error={errors.pickupAddress?.message} {...register('pickupAddress')} />
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <Checkbox className="size-5" {...register('needsCod')} />
          We’ll need cash-on-delivery collection for some orders
        </label>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Anything else we should know? (optional)</Label>
          <textarea
            id="notes"
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
            {...register('notes')}
          />
          <FieldError message={errors.notes?.message} />
        </div>
      </Section>

      <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary/20 bg-secondary/30 p-4 sm:p-6">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox className="mt-0.5 size-5" {...register('confirmAccuracy')} />
          I confirm these details are accurate and I’m authorised to open a merchant account for this company.
        </label>
        <FieldError message={errors.confirmAccuracy?.message} />
        {serverError ? (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <FieldError message={serverError} />
          </div>
        ) : null}
        <Button type="submit" size="lg" loading={isSubmitting} loadingText="Submitting…" disabled={isUploading} className="self-start">
          <Send aria-hidden />
          {isResubmission ? 'Resubmit application' : 'Submit application'}
        </Button>
      </div>
    </form>
  );
};

export default MerchantApplicationForm;
