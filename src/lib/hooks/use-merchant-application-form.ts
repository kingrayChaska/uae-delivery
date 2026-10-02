"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { submitMerchantApplicationAction } from "@/lib/merchant/actions";
import { merchantApplicationSchema } from "@/lib/merchant/schemas";

import type { MerchantApplicationInput } from "@/lib/merchant/schemas";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const useMerchantApplicationForm = (
  profileId: string,
  defaults: Partial<MerchantApplicationInput>,
) => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(
    defaults.tradeLicensePath ? "Document on file" : null,
  );

  const form = useForm<MerchantApplicationInput>({
    resolver: zodResolver(merchantApplicationSchema),
    mode: "onTouched",
    defaultValues: {
      companyName: "",
      licenseNumber: "",
      companyAddress: "",
      country: "United Arab Emirates",
      city: "",
      companyPhone: "",
      businessEmail: "",
      website: "",
      contactName: "",
      contactPosition: "",
      contactPhone: "",
      contactEmail: "",
      // Empty until chosen, so the select shows its placeholder.
      businessCategory: "" as MerchantApplicationInput["businessCategory"],
      monthlyShipmentVolume:
        "" as MerchantApplicationInput["monthlyShipmentVolume"],
      pickupAddress: "",
      needsCod: false,
      notes: "",
      tradeLicensePath: null,
      ...defaults,
      confirmAccuracy: undefined as unknown as true,
    },
  });

  // Uploaded straight to Storage under the applicant's own folder — the
  // merchant-documents bucket's RLS rejects any other path, and the bucket
  // itself enforces the size and file type (migration 0022).
  const uploadLicense = async (file: File) => {
    setUploadError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError("merchant.errors.uploadType");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("merchant.errors.uploadSize");
      return;
    }

    setIsUploading(true);
    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "pdf";
    const path = `${profileId}/trade-licence-${crypto.randomUUID()}.${extension}`;
    const { error } = await createClient()
      .storage.from("merchant-documents")
      .upload(path, file, { contentType: file.type });
    setIsUploading(false);

    if (error) {
      setUploadError("merchant.errors.uploadFailed");
      return;
    }
    form.setValue("tradeLicensePath", path, { shouldDirty: true });
    setFileName(file.name);
  };

  const removeLicense = () => {
    form.setValue("tradeLicensePath", null, { shouldDirty: true });
    setFileName(null);
  };

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    const result = await submitMerchantApplicationAction(input);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    router.push(result.redirectTo ?? "/dashboard/customer/merchant");
    router.refresh();
  });

  return {
    form,
    onSubmit,
    serverError,
    isSubmitting: form.formState.isSubmitting,
    uploadLicense,
    removeLicense,
    isUploading,
    uploadError,
    fileName,
  };
};
