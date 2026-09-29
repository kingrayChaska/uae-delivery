import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';

import type { Paginated } from '@/lib/pagination';
import type { MerchantStatus } from '@/lib/types';

export type MerchantApplication = {
  id: string;
  profileId: string;
  status: MerchantStatus;
  companyName: string;
  registrationNumber: string;
  licenseNumber: string;
  companyAddress: string;
  country: string;
  city: string;
  companyPhone: string;
  businessEmail: string;
  website: string | null;
  contactName: string;
  contactPosition: string;
  contactPhone: string;
  contactEmail: string;
  businessCategory: string;
  monthlyShipmentVolume: string;
  pickupAddress: string;
  needsCod: boolean;
  notes: string;
  tradeLicensePath: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  businessAccountId: string | null;
  submittedAt: string;
  createdAt: string;
};

const COLUMNS =
  'id, profile_id, status, company_name, registration_number, license_number, company_address, country, city, company_phone, business_email, website, contact_name, contact_position, contact_phone, contact_email, business_category, monthly_shipment_volume, pickup_address, needs_cod, notes, trade_license_path, review_note, reviewed_at, business_account_id, submitted_at, created_at';

type Row = {
  id: string;
  profile_id: string;
  status: MerchantStatus;
  company_name: string;
  registration_number: string;
  license_number: string;
  company_address: string;
  country: string;
  city: string;
  company_phone: string;
  business_email: string;
  website: string | null;
  contact_name: string;
  contact_position: string;
  contact_phone: string;
  contact_email: string;
  business_category: string;
  monthly_shipment_volume: string;
  pickup_address: string;
  needs_cod: boolean;
  notes: string;
  trade_license_path: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  business_account_id: string | null;
  submitted_at: string;
  created_at: string;
};

const mapRow = (row: Row): MerchantApplication => ({
  id: row.id,
  profileId: row.profile_id,
  status: row.status,
  companyName: row.company_name,
  registrationNumber: row.registration_number,
  licenseNumber: row.license_number,
  companyAddress: row.company_address,
  country: row.country,
  city: row.city,
  companyPhone: row.company_phone,
  businessEmail: row.business_email,
  website: row.website,
  contactName: row.contact_name,
  contactPosition: row.contact_position,
  contactPhone: row.contact_phone,
  contactEmail: row.contact_email,
  businessCategory: row.business_category,
  monthlyShipmentVolume: row.monthly_shipment_volume,
  pickupAddress: row.pickup_address,
  needsCod: row.needs_cod,
  notes: row.notes,
  tradeLicensePath: row.trade_license_path,
  reviewNote: row.review_note,
  reviewedAt: row.reviewed_at,
  businessAccountId: row.business_account_id,
  submittedAt: row.submitted_at,
  createdAt: row.created_at,
});

// RLS (merchant_applications_select) returns only the caller's own
// application, or every application for a manager.
export const getOwnMerchantApplication = async (profileId: string): Promise<MerchantApplication | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from('merchant_applications').select(COLUMNS).eq('profile_id', profileId).maybeSingle();
  return data ? mapRow(data as Row) : null;
};

export type MerchantApplicationListItem = MerchantApplication & { applicantName: string; applicantEmail: string };

export const listMerchantApplications = async (
  status: MerchantStatus | 'all',
  page: number,
): Promise<Paginated<MerchantApplicationListItem>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  let query = supabase
    .from('merchant_applications')
    .select(`${COLUMNS}, profiles!merchant_applications_profile_id_fkey(full_name, email)`, { count: 'exact' })
    .order('submitted_at', { ascending: false })
    .range(from, to);
  if (status !== 'all') query = query.eq('status', status);

  const { data, count } = await query;
  const items = ((data ?? []) as (Row & { profiles: unknown })[]).map((row) => {
    const applicant = row.profiles as { full_name: string; email: string } | null;
    return { ...mapRow(row), applicantName: applicant?.full_name ?? '—', applicantEmail: applicant?.email ?? '' };
  });
  return toPaginated(items, count ?? 0, page);
};

export const countMerchantApplicationsByStatus = async (): Promise<Record<MerchantStatus, number>> => {
  const supabase = await createClient();
  const statuses: MerchantStatus[] = ['pending', 'approved', 'rejected', 'requires_changes'];
  const results = await Promise.all(
    statuses.map((status) =>
      supabase.from('merchant_applications').select('id', { count: 'exact', head: true }).eq('status', status),
    ),
  );
  return Object.fromEntries(statuses.map((status, i) => [status, results[i].count ?? 0])) as Record<MerchantStatus, number>;
};

export type MerchantApplicationDetail = MerchantApplicationListItem & {
  applicantPhone: string;
  tradeLicenseUrl: string | null;
  reviewerName: string | null;
};

export const getMerchantApplication = async (applicationId: string): Promise<MerchantApplicationDetail | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('merchant_applications')
    .select(
      `${COLUMNS}, applicant:profiles!merchant_applications_profile_id_fkey(full_name, email, phone), reviewer:profiles!merchant_applications_reviewed_by_fkey(full_name)`,
    )
    .eq('id', applicationId)
    .maybeSingle();
  if (!data) return null;

  const row = data as Row & { applicant: unknown; reviewer: unknown };
  const applicant = row.applicant as { full_name: string; email: string; phone: string } | null;
  const reviewer = row.reviewer as { full_name: string } | null;

  // Private bucket: a short-lived signed URL, created under the manager's
  // own session (merchant_documents_select).
  let tradeLicenseUrl: string | null = null;
  if (row.trade_license_path) {
    const { data: signed } = await supabase.storage.from('merchant-documents').createSignedUrl(row.trade_license_path, 600);
    tradeLicenseUrl = signed?.signedUrl ?? null;
  }

  return {
    ...mapRow(row),
    applicantName: applicant?.full_name ?? '—',
    applicantEmail: applicant?.email ?? '',
    applicantPhone: applicant?.phone ?? '',
    tradeLicenseUrl,
    reviewerName: reviewer?.full_name ?? null,
  };
};
