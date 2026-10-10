import 'server-only';

import { after } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/auth/public-url';
import { sendEmail } from '@/lib/notifications/email';
import {
  MAX_LISTED_BATCH_SHIPMENTS,
  renderBatchEmail,
  renderShipmentEmail,
} from '@/lib/notifications/operator-booking-email';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BookingAccountType,
  OperatorBatchEmailData,
  OperatorShipmentEmailData,
  RenderedEmail,
} from '@/lib/notifications/operator-booking-email';

// Sends the queued "new booking" emails to the operations inbox
// (operator_booking_emails, migration 0043). Database triggers queue one
// row per self-service booking in the same transaction as the booking, so
// nothing here decides WHAT gets an email — only how it is sent:
//
//   1. claim due rows (each to exactly one worker, attempt counted first);
//   2. load the booking with the service-role client and render it;
//   3. send to OPERATOR_NOTIFICATION_EMAIL — server configuration, never
//      anything from a request — with the row id as Resend's idempotency
//      key, so a retry after an unrecorded success isn't a second email;
//   4. record 'accepted' (with the provider's message id), a retry with
//      backoff, or 'failed'.
//
// Runs after a booking action's response (scheduleOperatorBookingEmails)
// and from the cron route /api/internal/operator-emails, which also picks
// up retries. An email failing never touches the booking.

export const MAX_ATTEMPTS = 6;
const LEASE_SECONDS = 120;
const CLAIM_LIMIT = 10;
// A booking older than this is no longer news; it isn't sent late.
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
// Wait after failed attempt 1, 2, 3, 4, 5 (attempt 6 is the last).
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000];
const MAX_RECIPIENTS = 10;

export const retryDelayMs = (attempt: number) =>
  RETRY_DELAYS_MS[Math.min(Math.max(attempt, 1), RETRY_DELAYS_MS.length) - 1];

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

// OPERATOR_NOTIFICATION_EMAIL: one address, or several separated by commas.
export const operatorRecipients = (): string[] => {
  const raw = process.env.OPERATOR_NOTIFICATION_EMAIL ?? '';
  const addresses = raw
    .split(/[,;]/)
    .map((address) => address.trim().toLowerCase())
    .filter((address) => address !== '');
  const valid = [...new Set(addresses.filter((address) => EMAIL.test(address)))];
  if (valid.length !== addresses.length) log('warn', 'recipient_invalid', { ignored: addresses.length - valid.length });
  return valid.slice(0, MAX_RECIPIENTS);
};

// One JSON line per event. Ids and tracking codes only — no names, phones,
// addresses or email addresses.
type LogLevel = 'info' | 'warn' | 'error';
const log = (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
  console[level](JSON.stringify({ scope: 'operator_booking_email', event, ...fields }));
};

type OutboxRow = {
  id: string;
  shipment_id: string | null;
  batch_id: string | null;
  attempts: number;
  created_at: string;
};

type Admin = SupabaseClient;

const one = <T>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

type CustomerJoin = { full_name: string | null; phone: string | null; account_type: BookingAccountType | null };
type BusinessJoin = { company_name: string | null };

const toCustomer = (customer: CustomerJoin | null, business: BusinessJoin | null) => ({
  accountType: customer?.account_type === 'merchant' ? ('merchant' as const) : ('individual' as const),
  name: customer?.full_name ?? null,
  companyName: business?.company_name ?? null,
  phone: customer?.phone ?? null,
});

const CUSTOMER_COLUMNS = 'full_name, phone, account_type';

const loadShipment = async (admin: Admin, id: string): Promise<OperatorShipmentEmailData | null> => {
  const { data, error } = await admin
    .from('shipments')
    .select(
      `id, tracking_number, status, payment_method, payment_status, delivery_type, delivery_date, pickup_address, pickup_contact_name, pickup_contact_phone, dropoff_address, package_type, package_description, package_quantity, is_fragile, created_at, customer:profiles!shipments_customer_id_fkey(${CUSTOMER_COLUMNS}), business:business_accounts(company_name)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`load_failed:${error.code ?? 'unknown'}`);
  if (!data) return null;
  return {
    id: data.id,
    trackingNumber: data.tracking_number,
    customer: toCustomer(one(data.customer as CustomerJoin | CustomerJoin[]), one(data.business as BusinessJoin | BusinessJoin[])),
    status: data.status,
    paymentMethod: data.payment_method,
    paymentStatus: data.payment_status,
    deliveryType: data.delivery_type,
    deliveryDate: data.delivery_date,
    pickupAddress: data.pickup_address,
    pickupContactName: data.pickup_contact_name,
    pickupContactPhone: data.pickup_contact_phone,
    dropoffAddress: data.dropoff_address,
    packageType: data.package_type,
    packageDescription: data.package_description,
    packageQuantity: data.package_quantity,
    isFragile: Boolean(data.is_fragile),
    createdAt: data.created_at,
  };
};

const loadBatch = async (admin: Admin, id: string): Promise<OperatorBatchEmailData | null> => {
  const [{ data: batch, error }, { data: shipments, count, error: shipmentsError }] = await Promise.all([
    admin
      .from('shipment_batches')
      .select(
        `id, reference, pickup_address, pickup_date, created_at, booked_at, rows_failed, customer:profiles!shipment_batches_customer_id_fkey(${CUSTOMER_COLUMNS}), business:business_accounts(company_name)`,
      )
      .eq('id', id)
      .maybeSingle(),
    admin
      .from('shipments')
      .select('id, tracking_number, dropoff_address, delivery_type, status, payment_method', { count: 'exact' })
      .eq('batch_id', id)
      .order('created_at', { ascending: true })
      .limit(MAX_LISTED_BATCH_SHIPMENTS),
  ]);
  if (error || shipmentsError) throw new Error(`load_failed:${(error ?? shipmentsError)?.code ?? 'unknown'}`);
  if (!batch) return null;
  const rows = shipments ?? [];
  return {
    id: batch.id,
    reference: batch.reference,
    customer: toCustomer(one(batch.customer as CustomerJoin | CustomerJoin[]), one(batch.business as BusinessJoin | BusinessJoin[])),
    pickupAddress: batch.pickup_address ?? null,
    pickupDate: batch.pickup_date,
    paymentMethod: rows[0]?.payment_method ?? null,
    createdAt: batch.booked_at ?? batch.created_at,
    shipmentCount: count ?? rows.length,
    rowsFailed: batch.rows_failed ?? 0,
    shipments: rows.map((s) => ({
      id: s.id,
      trackingNumber: s.tracking_number,
      dropoffAddress: s.dropoff_address,
      deliveryType: s.delivery_type,
      status: s.status,
    })),
  };
};

type Patch = {
  status: 'pending' | 'accepted' | 'failed';
  last_error?: string | null;
  next_attempt_at?: string;
  provider_message_id?: string | null;
  accepted_at?: string;
};

// Records the outcome only if this worker still holds the claim: if its
// lease ran out and another worker re-claimed the row (attempts moved on),
// that worker's outcome is the one that counts.
const finish = async (admin: Admin, row: OutboxRow, patch: Patch, ref: Record<string, unknown>) => {
  const { data, error } = await admin
    .from('operator_booking_emails')
    .update({ ...patch, locked_until: null })
    .eq('id', row.id)
    .eq('status', 'sending')
    .eq('attempts', row.attempts)
    .select('id');
  if (error) {
    log('error', 'record_failed', { ...ref, code: error.code });
    return false;
  }
  if (!data || data.length === 0) {
    log('warn', 'duplicate_ignored', { ...ref, reason: 'claim_superseded' });
    return false;
  }
  return true;
};

export type ProcessSummary = { processed: number; accepted: number; retrying: number; failed: number };

type Outcome = 'accepted' | 'retrying' | 'failed' | 'skipped';

const processRow = async (admin: Admin, row: OutboxRow, recipients: string[], origin: string, now: Date): Promise<Outcome> => {
  const kind = row.shipment_id ? 'shipment' : 'batch';
  const ref = { outboxId: row.id, kind, shipmentId: row.shipment_id, batchId: row.batch_id, attempt: row.attempts };
  log('info', 'notification_requested', ref);

  const fail = async (reason: string, extra: Record<string, unknown> = {}): Promise<Outcome> => {
    log('error', 'notification_failed', { ...ref, reason, ...extra });
    return (await finish(admin, row, { status: 'failed', last_error: reason }, ref)) ? 'failed' : 'skipped';
  };
  const retry = async (reason: string, extra: Record<string, unknown> = {}): Promise<Outcome> => {
    if (row.attempts >= MAX_ATTEMPTS) return fail(reason, { ...extra, gaveUp: true });
    const nextAttemptAt = new Date(now.getTime() + retryDelayMs(row.attempts)).toISOString();
    log('warn', 'retry_scheduled', { ...ref, reason, nextAttemptAt, ...extra });
    return (await finish(admin, row, { status: 'pending', last_error: reason, next_attempt_at: nextAttemptAt }, ref)) ? 'retrying' : 'skipped';
  };

  if (now.getTime() - new Date(row.created_at).getTime() > MAX_AGE_MS) return fail('expired');

  let email: RenderedEmail;
  let trackingRef: string;
  try {
    if (row.shipment_id) {
      const data = await loadShipment(admin, row.shipment_id);
      if (!data) return fail('booking_not_found');
      email = renderShipmentEmail(data, origin);
      trackingRef = data.trackingNumber;
    } else {
      const data = await loadBatch(admin, row.batch_id!);
      if (!data) return fail('booking_not_found');
      email = renderBatchEmail(data, origin);
      trackingRef = data.reference;
    }
  } catch (error) {
    return retry(error instanceof Error && error.message.startsWith('load_failed') ? error.message : 'render_failed');
  }

  const result = await sendEmail({
    to: recipients,
    subject: email.subject,
    text: email.text,
    html: email.html,
    idempotencyKey: `operator-booking-email/${row.id}`,
  });

  if (result.sent) {
    log('info', 'provider_accepted', { ...ref, reference: trackingRef, providerMessageId: result.id });
    const recorded = await finish(
      admin,
      row,
      { status: 'accepted', accepted_at: now.toISOString(), provider_message_id: result.id, last_error: null },
      ref,
    );
    return recorded ? 'accepted' : 'skipped';
  }

  // The key was already used with a different body: an earlier attempt
  // (whose outcome we failed to record) reached the provider and the
  // booking has changed since. Sending again would be the duplicate.
  if (result.providerError === 'invalid_idempotent_request') {
    log('warn', 'duplicate_ignored', { ...ref, reason: 'idempotent_replay' });
    return (await finish(admin, row, { status: 'accepted', accepted_at: now.toISOString(), last_error: 'idempotent_replay' }, ref))
      ? 'accepted'
      : 'skipped';
  }

  const extra = result.providerError ? { providerError: result.providerError } : {};
  return result.retryable ? retry(result.reason, extra) : fail(result.reason, extra);
};

export const processOperatorBookingEmails = async ({
  limit = CLAIM_LIMIT,
  now = () => new Date(),
}: { limit?: number; now?: () => Date } = {}): Promise<ProcessSummary> => {
  const summary: ProcessSummary = { processed: 0, accepted: 0, retrying: 0, failed: 0 };

  // Without a recipient or provider nothing is claimed, so no attempt is
  // used up: the queue waits and is sent once configuration is fixed
  // (minus anything older than MAX_AGE_MS by then).
  const recipients = operatorRecipients();
  if (recipients.length === 0) {
    log('error', 'recipient_missing', { hint: 'Set OPERATOR_NOTIFICATION_EMAIL' });
    return summary;
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    log('error', 'provider_not_configured', { hint: 'Set RESEND_API_KEY and EMAIL_FROM' });
    return summary;
  }

  const admin = createAdminClient();
  const at = now();

  // A worker that died during its final attempt leaves the row 'sending'
  // with no attempts left to claim it again.
  const { data: abandoned } = await admin
    .from('operator_booking_emails')
    .update({ status: 'failed', last_error: 'abandoned', locked_until: null })
    .eq('status', 'sending')
    .lt('locked_until', at.toISOString())
    .gte('attempts', MAX_ATTEMPTS)
    .select('id');
  for (const { id } of abandoned ?? []) log('error', 'notification_failed', { outboxId: id, reason: 'abandoned' });

  const { data, error } = await admin.rpc('claim_operator_booking_emails', {
    p_limit: limit,
    p_lease_seconds: LEASE_SECONDS,
    p_max_attempts: MAX_ATTEMPTS,
  });
  if (error) {
    log('error', 'claim_failed', { code: error.code });
    return summary;
  }

  const origin = getPublicOrigin();
  for (const row of (data ?? []) as OutboxRow[]) {
    const outcome = await processRow(admin, row, recipients, origin, at);
    summary.processed += 1;
    if (outcome !== 'skipped') summary[outcome] += 1;
  }
  return summary;
};

// Called by booking actions: sends what their booking queued (and any due
// retries) after the response, so the customer never waits on email.
export const scheduleOperatorBookingEmails = () => {
  after(async () => {
    try {
      await processOperatorBookingEmails();
    } catch (error) {
      log('error', 'run_failed', { message: error instanceof Error ? error.message : 'unknown' });
    }
  });
};
