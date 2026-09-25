'use server';

import { requireRole } from '@/lib/auth/guards';
import { isUuid } from '@/lib/security/validate';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { logAuditEvent } from '@/lib/audit/log';
import { RATE_LIMIT_MESSAGE, checkRateLimit } from '@/lib/security/rate-limit';
import { parseCsvWithHeaders } from '@/lib/csv/parse';
import { createBatchShipments, finalizeBatch, openBatch } from '@/services/bulk/create-batch';
import {
  BULK_MAX_ROWS,
  businessAccountSchema,
  missingBulkColumns,
  validateBulkRecords,
} from '@/lib/business/schemas';

import type { BusinessAccountInput } from '@/lib/business/schemas';
import type { BulkRowResult } from '@/lib/bulk/schemas';

export type BusinessActionResult = { success: true; id?: string } | { success: false; error: string };

const toRow = (data: BusinessAccountInput) => ({
  company_name: data.companyName,
  contact_person: data.contactPerson,
  contact_email: data.contactEmail,
  contact_phone: data.contactPhone,
  billing_info: { address: data.billingAddress ?? '', trn: data.trn ?? '' },
});

export const createBusinessAccountAction = async (input: BusinessAccountInput): Promise<BusinessActionResult> => {
  const manager = await requireRole('manager');
  const parsed = businessAccountSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('business_accounts')
    .insert({ ...toRow(parsed.data), created_by: manager.id })
    .select('id')
    .single();
  if (error || !data) return { success: false, error: safeErrorMessage(error, 'Could not create the account') };

  await logAuditEvent({
    actorId: manager.id,
    action: 'business.create',
    entityType: 'business_account',
    entityId: data.id,
    newValue: parsed.data,
  });
  return { success: true, id: data.id };
};

export const updateBusinessAccountAction = async (
  businessId: string,
  input: BusinessAccountInput,
): Promise<BusinessActionResult> => {
  if (!isUuid(businessId)) return { success: false, error: 'Not found' };
  const manager = await requireRole('manager');
  const parsed = businessAccountSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = await createClient();
  const { error } = await supabase.from('business_accounts').update(toRow(parsed.data)).eq('id', businessId);
  if (error) return { success: false, error: safeErrorMessage(error) };

  await logAuditEvent({
    actorId: manager.id,
    action: 'business.update',
    entityType: 'business_account',
    entityId: businessId,
    newValue: parsed.data,
  });
  return { success: true };
};

export const setBusinessActiveAction = async (businessId: string, active: boolean): Promise<BusinessActionResult> => {
  if (!isUuid(businessId)) return { success: false, error: 'Not found' };
  const manager = await requireRole('manager');
  const supabase = await createClient();
  const { error } = await supabase.from('business_accounts').update({ active }).eq('id', businessId);
  if (error) return { success: false, error: safeErrorMessage(error) };

  await logAuditEvent({
    actorId: manager.id,
    action: active ? 'business.activate' : 'business.deactivate',
    entityType: 'business_account',
    entityId: businessId,
  });
  return { success: true };
};

// Members are existing customer accounts, added by email — businesses
// don't get a separate login system; their people sign up as customers.
export const addBusinessMemberAction = async (businessId: string, email: string): Promise<BusinessActionResult> => {
  if (!isUuid(businessId)) return { success: false, error: 'Not found' };
  const manager = await requireRole('manager');
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (!customer || customer.role !== 'customer') {
    return { success: false, error: 'No customer account with that email. Ask them to register first.' };
  }

  const { error } = await supabase
    .from('business_account_members')
    .insert({ business_account_id: businessId, profile_id: customer.id });
  if (error) {
    return { success: false, error: error.code === '23505' ? 'Already a member' : error.message };
  }

  await logAuditEvent({
    actorId: manager.id,
    action: 'business.add_member',
    entityType: 'business_account',
    entityId: businessId,
    newValue: { profileId: customer.id },
  });
  return { success: true };
};

export const removeBusinessMemberAction = async (businessId: string, profileId: string): Promise<BusinessActionResult> => {
  if (!isUuid(businessId) || !isUuid(profileId)) return { success: false, error: 'Not found' };
  const manager = await requireRole('manager');
  const supabase = await createClient();
  const { error } = await supabase
    .from('business_account_members')
    .delete()
    .eq('business_account_id', businessId)
    .eq('profile_id', profileId);
  if (error) return { success: false, error: safeErrorMessage(error) };

  await logAuditEvent({
    actorId: manager.id,
    action: 'business.remove_member',
    entityType: 'business_account',
    entityId: businessId,
    oldValue: { profileId },
  });
  return { success: true };
};

export type { BulkRowResult };
export type BulkUploadResult =
  | { success: true; created: number; failed: number; rows: BulkRowResult[] }
  | { success: false; error: string };

// The browser preview is a convenience only — everything is re-parsed and
// re-validated here, then created through the same batch pipeline as a
// customer-submitted bulk list (services/bulk/create-batch.ts), so the
// upload shows up under Bulk Shipments for operators and managers too.
export const bulkCreateShipmentsAction = async (
  businessId: string,
  ownerProfileId: string,
  csvText: string,
): Promise<BulkUploadResult> => {
  if (!isUuid(businessId) || !isUuid(ownerProfileId)) return { success: false, error: 'Not found' };
  const manager = await requireRole('manager');
  if (!(await checkRateLimit('bulkUploadPerUser', manager.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const supabase = await createClient();

  const [{ data: business }, { data: membership }] = await Promise.all([
    supabase.from('business_accounts').select('id, active, company_name').eq('id', businessId).maybeSingle(),
    supabase
      .from('business_account_members')
      .select('profile_id')
      .eq('business_account_id', businessId)
      .eq('profile_id', ownerProfileId)
      .maybeSingle(),
  ]);

  if (!business || !business.active) return { success: false, error: 'Business account not found or inactive' };
  if (!membership) return { success: false, error: 'The selected shipment owner is not a member of this business' };

  if (csvText.length > 500_000) return { success: false, error: 'File is too large' };

  const { headers, records } = parseCsvWithHeaders(csvText);
  const missing = missingBulkColumns(headers);
  if (missing.length > 0) return { success: false, error: `Missing columns: ${missing.join(', ')}` };
  if (records.length === 0) return { success: false, error: 'The file has no shipment rows' };
  if (records.length > BULK_MAX_ROWS) {
    return { success: false, error: `Upload at most ${BULK_MAX_ROWS} rows at a time (got ${records.length})` };
  }

  const validations = validateBulkRecords(records);

  let batch;
  try {
    batch = await openBatch({
      customerId: ownerProfileId,
      createdBy: manager.id,
      businessAccountId: businessId,
      name: `CSV upload — ${business.company_name}`,
      pickupDate: null,
      notes: '',
      clientRequestId: null,
    });
  } catch (batchError) {
    return { success: false, error: batchError instanceof Error ? batchError.message : 'Could not start the upload' };
  }

  const results = await createBatchShipments({
    customerId: ownerProfileId,
    businessAccountId: businessId,
    batchId: batch.id,
    validations,
  });
  await finalizeBatch(batch.id, results);

  const created = results.filter((r) => r.ok).length;

  await logAuditEvent({
    actorId: manager.id,
    action: 'business.bulk_upload',
    entityType: 'business_account',
    entityId: businessId,
    newValue: { batchId: batch.id, rows: records.length, created, failed: records.length - created },
  });

  return { success: true, created, failed: records.length - created, rows: results };
};
