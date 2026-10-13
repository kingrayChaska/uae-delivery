import 'server-only';

import { after } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/auth/public-url';
import { sendEmail } from '@/lib/notifications/email';
import { renderStatementEmail, statementEmailUrl } from '@/lib/notifications/statement-email';
import { retryDelayMs } from '@/services/notifications/operator-booking-emails';

import type { SupabaseClient } from '@supabase/supabase-js';

// Sends the queued "statement ready" emails (merchant_statement_emails,
// migration 0045). publish_merchant_statement() queues one row per
// published statement, in the same transaction, when the manager asked for
// an email. Same outbox mechanics as the operator booking emails (0043):
// claim (attempt counted first) → load → send with the row id as the
// idempotency key → record accepted / retry with backoff / failed.
//
// Recipients come from the database only: the business account's contact
// email and the account emails of its active members. Nothing in a request
// can choose them. Runs after the publish action's response and from the
// cron route /api/internal/statement-emails, which also picks up retries.

export const MAX_ATTEMPTS = 6;
const LEASE_SECONDS = 120;
const CLAIM_LIMIT = 10;
// A week-old "your statement is ready" is still worth sending; older isn't.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECIPIENTS = 10;
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

type LogLevel = 'info' | 'warn' | 'error';
// Ids only — never addresses, names or amounts.
const log = (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
  console[level](JSON.stringify({ scope: 'statement_email', event, ...fields }));
};

type OutboxRow = { id: string; statement_id: string; attempts: number; created_at: string };
type Admin = SupabaseClient;

// The addresses a statement email goes to, de-duplicated and validated.
export const statementRecipients = (contactEmail: string | null, memberEmails: (string | null)[]): string[] => {
  const all = [contactEmail, ...memberEmails]
    .map((address) => (address ?? '').trim().toLowerCase())
    .filter((address) => address !== '' && EMAIL.test(address));
  return [...new Set(all)].slice(0, MAX_RECIPIENTS);
};

const load = async (admin: Admin, statementId: string) => {
  const { data: statement, error } = await admin
    .from('merchant_statements')
    .select('id, statement_number, status, period_start, period_end, business_account_id, merchant')
    .eq('id', statementId)
    .maybeSingle();
  if (error) throw new Error(`load_failed:${error.code ?? 'unknown'}`);
  if (!statement || !statement.statement_number || statement.status === 'draft') return null;

  const [{ data: business, error: businessError }, { data: members, error: membersError }] = await Promise.all([
    admin.from('business_accounts').select('contact_email').eq('id', statement.business_account_id).maybeSingle(),
    admin
      .from('business_account_members')
      .select('profile:profiles!inner(email, active, deleted_at)')
      .eq('business_account_id', statement.business_account_id),
  ]);
  if (businessError || membersError) throw new Error(`load_failed:${(businessError ?? membersError)?.code ?? 'unknown'}`);

  type Member = { profile: { email: string | null; active: boolean; deleted_at: string | null } | null };
  const memberEmails = ((members ?? []) as unknown as Member[])
    .map((m) => m.profile)
    .filter((p): p is NonNullable<Member['profile']> => Boolean(p && p.active && !p.deleted_at))
    .map((p) => p.email);

  return {
    recipients: statementRecipients((business as { contact_email: string | null } | null)?.contact_email ?? null, memberEmails),
    email: {
      statementId: statement.id as string,
      statementNumber: statement.statement_number as string,
      merchantName: ((statement.merchant as { name?: string } | null)?.name ?? '').trim() || 'there',
      periodStart: statement.period_start as string,
      periodEnd: statement.period_end as string,
    },
  };
};

type Patch = {
  status: 'pending' | 'accepted' | 'failed';
  last_error?: string | null;
  next_attempt_at?: string;
  provider_message_id?: string | null;
  accepted_at?: string;
  recipient_count?: number;
};

// Records the outcome only while this worker still holds the claim.
const finish = async (admin: Admin, row: OutboxRow, patch: Patch) => {
  const { data, error } = await admin
    .from('merchant_statement_emails')
    .update({ ...patch, locked_until: null })
    .eq('id', row.id)
    .eq('status', 'sending')
    .eq('attempts', row.attempts)
    .select('id');
  if (error) log('error', 'record_failed', { outboxId: row.id, code: error.code });
  return Boolean(!error && data && data.length > 0);
};

export type StatementEmailSummary = { processed: number; accepted: number; retrying: number; failed: number };
type Outcome = 'accepted' | 'retrying' | 'failed' | 'skipped';

const processRow = async (admin: Admin, row: OutboxRow, origin: string, now: Date): Promise<Outcome> => {
  const ref = { outboxId: row.id, statementId: row.statement_id, attempt: row.attempts };
  const fail = async (reason: string): Promise<Outcome> => {
    log('error', 'notification_failed', { ...ref, reason });
    return (await finish(admin, row, { status: 'failed', last_error: reason })) ? 'failed' : 'skipped';
  };
  const retry = async (reason: string): Promise<Outcome> => {
    if (row.attempts >= MAX_ATTEMPTS) return fail(reason);
    const nextAttemptAt = new Date(now.getTime() + retryDelayMs(row.attempts)).toISOString();
    log('warn', 'retry_scheduled', { ...ref, reason, nextAttemptAt });
    return (await finish(admin, row, { status: 'pending', last_error: reason, next_attempt_at: nextAttemptAt })) ? 'retrying' : 'skipped';
  };

  if (now.getTime() - new Date(row.created_at).getTime() > MAX_AGE_MS) return fail('expired');

  let loaded: Awaited<ReturnType<typeof load>>;
  try {
    loaded = await load(admin, row.statement_id);
  } catch (error) {
    return retry(error instanceof Error ? error.message : 'load_failed');
  }
  if (!loaded) return fail('statement_not_found');
  if (loaded.recipients.length === 0) return fail('no_recipients');

  const content = renderStatementEmail(loaded.email);
  const result = await sendEmail({
    to: loaded.recipients,
    ...content,
    actionUrl: statementEmailUrl(origin, loaded.email.statementId),
    idempotencyKey: `statement-email/${row.id}`,
  });

  if (result.sent) {
    log('info', 'provider_accepted', { ...ref, recipients: loaded.recipients.length, providerMessageId: result.id });
    return (await finish(admin, row, {
      status: 'accepted',
      accepted_at: now.toISOString(),
      provider_message_id: result.id,
      recipient_count: loaded.recipients.length,
      last_error: null,
    }))
      ? 'accepted'
      : 'skipped';
  }
  if (result.providerError === 'invalid_idempotent_request') {
    return (await finish(admin, row, { status: 'accepted', accepted_at: now.toISOString(), last_error: 'idempotent_replay' })) ? 'accepted' : 'skipped';
  }
  return result.retryable ? retry(result.reason) : fail(result.reason);
};

export const processStatementEmails = async ({
  limit = CLAIM_LIMIT,
  now = () => new Date(),
}: { limit?: number; now?: () => Date } = {}): Promise<StatementEmailSummary> => {
  const summary: StatementEmailSummary = { processed: 0, accepted: 0, retrying: 0, failed: 0 };
  // Without a provider nothing is claimed, so no attempt is used up.
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    log('error', 'provider_not_configured', { hint: 'Set RESEND_API_KEY and EMAIL_FROM' });
    return summary;
  }

  const admin = createAdminClient();
  const at = now();
  await admin
    .from('merchant_statement_emails')
    .update({ status: 'failed', last_error: 'abandoned', locked_until: null })
    .eq('status', 'sending')
    .lt('locked_until', at.toISOString())
    .gte('attempts', MAX_ATTEMPTS);

  const { data, error } = await admin.rpc('claim_merchant_statement_emails', {
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
    const outcome = await processRow(admin, row, origin, at);
    summary.processed += 1;
    if (outcome !== 'skipped') summary[outcome] += 1;
  }
  return summary;
};

// Called after publishing: sends after the response, so the manager never
// waits on email, and a failed email never affects the publication.
export const scheduleStatementEmails = () => {
  after(async () => {
    try {
      await processStatementEmails();
    } catch (error) {
      log('error', 'run_failed', { message: error instanceof Error ? error.message : 'unknown' });
    }
  });
};
