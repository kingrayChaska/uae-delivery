import 'server-only';

import { localizeNotification } from '@/lib/notifications/localize';
import { createAdminClient } from '@/lib/supabase/admin';

import type { SupabaseClient } from '@supabase/supabase-js';

// Sends the in-app notifications of staff who use the ParcelLink app as
// push notifications (migration 0047), through Expo's push service:
//
//   1. claim recent, unsent notifications of people with an app device
//      (each to exactly one worker, attempt counted first);
//   2. send one message per device token, with the notification's stored
//      title and body and, when it names a shipment, that shipment's id so a
//      tap opens it (the app's screen re-checks access; the push grants none);
//   3. record 'sent' (Expo accepted it for at least one device), a retry, or
//      'failed'; tokens Expo says are no longer registered are disabled.
//
// Runs from /api/internal/push-worker (a Supabase database webhook on new
// notifications, and/or a cron). A push failing never touches the
// notification itself, which is always in the app's Alerts list.

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const MAX_ATTEMPTS = 3;
const LEASE_SECONDS = 60;
const CLAIM_LIMIT = 50;
// Older than this, a notification isn't news any more and isn't pushed late.
const MAX_AGE_MINUTES = 6 * 60;
// Expo accepts at most 100 messages per request.
const EXPO_BATCH = 100;

export type ClaimedNotification = {
  notification_id: string;
  profile_id: string;
  type: string;
  title: string;
  body: string;
  attempts: number;
  tokens: string[];
};

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: 'default';
  data: { notificationId: string; type: string; shipmentId?: string };
};

export type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; message?: string; details?: { error?: string } };

type Outcome = 'sent' | 'retrying' | 'failed';
export type PushSummary = { processed: number; sent: number; retrying: number; failed: number; disabledTokens: number };

const log = (level: 'info' | 'error', event: string, fields: Record<string, unknown> = {}) =>
  console[level](JSON.stringify({ scope: 'mobile_push', event, ...fields }));

// The tracking code a notification is about, when it names one (the same
// patterns the app uses to translate it, lib/notifications/localize.ts).
export const trackingCodeOf = (notification: Pick<ClaimedNotification, 'type' | 'title' | 'body'>): string | null =>
  localizeNotification(notification)?.values.code ?? null;

export const buildMessages = (notification: ClaimedNotification, shipmentId: string | null): ExpoMessage[] =>
  notification.tokens.map((to) => ({
    to,
    title: notification.title.slice(0, 120),
    body: notification.body.slice(0, 400),
    sound: 'default',
    priority: 'high',
    channelId: 'default',
    data: { notificationId: notification.notification_id, type: notification.type, ...(shipmentId ? { shipmentId } : {}) },
  }));

// What one notification's tickets mean: sent if Expo took it for any device;
// a token it says is gone is disabled; otherwise retried until the last
// attempt.
export const interpretTickets = (
  tokens: string[],
  tickets: (ExpoTicket | undefined)[],
  attempts: number,
): { outcome: Outcome; deadTokens: string[]; error: string | null } => {
  const deadTokens = tokens.filter((_, i) => {
    const ticket = tickets[i];
    return ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered';
  });
  if (tickets.some((ticket) => ticket?.status === 'ok')) return { outcome: 'sent', deadTokens, error: null };
  const firstError = tickets.find((ticket): ticket is Extract<ExpoTicket, { status: 'error' }> => ticket?.status === 'error');
  const error = (firstError?.details?.error ?? 'no_ticket').slice(0, 200);
  // Every device is gone: nothing left to retry.
  if (deadTokens.length === tokens.length) return { outcome: 'failed', deadTokens, error };
  return { outcome: attempts >= MAX_ATTEMPTS ? 'failed' : 'retrying', deadTokens, error };
};

const sendToExpo = async (messages: ExpoMessage[], fetchImpl: typeof fetch): Promise<ExpoTicket[] | { error: string }> => {
  try {
    const response = await fetchImpl(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // Only when "Enhanced push security" is turned on for the Expo project.
        ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) return { error: `http_${response.status}` };
    const payload = (await response.json()) as { data?: ExpoTicket[] };
    return Array.isArray(payload.data) ? payload.data : { error: 'bad_response' };
  } catch {
    return { error: 'network' };
  }
};

const shipmentIdsByCode = async (admin: SupabaseClient, codes: string[]): Promise<Map<string, string>> => {
  if (codes.length === 0) return new Map();
  const { data } = await admin.from('shipments').select('id, tracking_number').in('tracking_number', codes);
  return new Map((data ?? []).map((row) => [row.tracking_number as string, row.id as string]));
};

const record = async (admin: SupabaseClient, notificationId: string, outcome: Outcome, error: string | null) => {
  const update =
    outcome === 'sent'
      ? { status: 'sent', sent_at: new Date().toISOString(), locked_until: null, last_error: null }
      : outcome === 'failed'
        ? { status: 'failed', locked_until: null, last_error: error }
        : // Retried once the lease runs out (claim_push_notifications).
          { last_error: error };
  await admin.from('notification_push_deliveries').update(update).eq('notification_id', notificationId);
};

export const processPushNotifications = async ({
  limit = CLAIM_LIMIT,
  fetchImpl = fetch,
}: { limit?: number; fetchImpl?: typeof fetch } = {}): Promise<PushSummary> => {
  const summary: PushSummary = { processed: 0, sent: 0, retrying: 0, failed: 0, disabledTokens: 0 };
  const admin = createAdminClient();

  // A worker that died during the last attempt leaves the row 'sending'
  // with no attempts left to claim it again.
  await admin
    .from('notification_push_deliveries')
    .update({ status: 'failed', last_error: 'abandoned', locked_until: null })
    .eq('status', 'sending')
    .lt('locked_until', new Date().toISOString())
    .gte('attempts', MAX_ATTEMPTS);

  const { data, error } = await admin.rpc('claim_push_notifications', {
    p_limit: limit,
    p_lease_seconds: LEASE_SECONDS,
    p_max_attempts: MAX_ATTEMPTS,
    p_max_age_minutes: MAX_AGE_MINUTES,
  });
  if (error) {
    log('error', 'claim_failed', { code: error.code });
    return summary;
  }
  const claimed = ((data ?? []) as ClaimedNotification[]).filter((row) => row.tokens.length > 0);
  if (claimed.length === 0) return summary;

  const codes = [...new Set(claimed.map(trackingCodeOf).filter((code): code is string => code !== null))];
  const ids = await shipmentIdsByCode(admin, codes);

  // Expo answers one ticket per message, in order.
  const entries = claimed.flatMap((notification) => {
    const code = trackingCodeOf(notification);
    return buildMessages(notification, code ? (ids.get(code) ?? null) : null).map((message) => ({ notification, message }));
  });
  const tickets = new Map<ExpoMessage, ExpoTicket | undefined>();
  const failures = new Map<string, string>();
  for (let i = 0; i < entries.length; i += EXPO_BATCH) {
    const batch = entries.slice(i, i + EXPO_BATCH);
    const result = await sendToExpo(
      batch.map((entry) => entry.message),
      fetchImpl,
    );
    if ('error' in result) {
      for (const entry of batch) failures.set(entry.notification.notification_id, result.error);
      log('error', 'expo_request_failed', { reason: result.error, messages: batch.length });
      continue;
    }
    batch.forEach((entry, index) => tickets.set(entry.message, result[index]));
  }

  const deadTokens = new Set<string>();
  for (const notification of claimed) {
    const requestError = failures.get(notification.notification_id);
    const outcome = requestError
      ? { outcome: (notification.attempts >= MAX_ATTEMPTS ? 'failed' : 'retrying') as Outcome, deadTokens: [], error: requestError }
      : interpretTickets(
          notification.tokens,
          entries.filter((entry) => entry.notification === notification).map((entry) => tickets.get(entry.message)),
          notification.attempts,
        );
    outcome.deadTokens.forEach((token) => deadTokens.add(token));
    await record(admin, notification.notification_id, outcome.outcome, outcome.error);
    summary.processed += 1;
    summary[outcome.outcome] += 1;
    if (outcome.outcome === 'failed') log('error', 'push_failed', { notificationId: notification.notification_id, reason: outcome.error });
  }

  if (deadTokens.size > 0) {
    await admin
      .from('mobile_push_devices')
      .update({ enabled: false, disabled_reason: 'DeviceNotRegistered' })
      .in('expo_push_token', [...deadTokens]);
    summary.disabledTokens = deadTokens.size;
  }
  return summary;
};
