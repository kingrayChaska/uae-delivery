'use server';

import { requireRole, requireUser } from '@/lib/auth/guards';
import { isUuid } from '@/lib/security/validate';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { RATE_LIMIT_MESSAGE, checkRateLimit } from '@/lib/security/rate-limit';
import { createTicketSchema, replyToTicketSchema } from '@/lib/support/schemas';

import type { CreateTicketInput, ReplyToTicketInput } from '@/lib/support/schemas';

export type TicketSummary = {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type TicketMessage = {
  id: string;
  senderId: string;
  senderIsMe: boolean;
  message: string;
  createdAt: string;
};

export type TicketDetail = { ticket: TicketSummary; messages: TicketMessage[] };

export const listTicketsAction = async (): Promise<TicketSummary[]> => {
  const profile = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('support_tickets')
    .select('id, subject, status, created_at, updated_at')
    .eq('profile_id', profile.id)
    .order('updated_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    subject: row.subject,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
};

export type CreateTicketResult = { success: true; ticketId: string } | { success: false; error: string };

export const createTicketAction = async (input: CreateTicketInput): Promise<CreateTicketResult> => {
  const profile = await requireUser();
  if (!(await checkRateLimit('ticketPerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .insert({ profile_id: profile.id, subject: parsed.data.subject })
    .select('id')
    .single();

  if (ticketError || !ticket) {
    return { success: false, error: safeErrorMessage(ticketError, 'Could not open a ticket') };
  }

  const { error: messageError } = await supabase
    .from('support_ticket_messages')
    .insert({ ticket_id: ticket.id, sender_id: profile.id, message: parsed.data.message });

  if (messageError) return { success: false, error: safeErrorMessage(messageError) };

  return { success: true, ticketId: ticket.id };
};

export const getTicketAction = async (ticketId: string): Promise<TicketDetail | null> => {
  if (!isUuid(ticketId)) return null;
  const profile = await requireUser();
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id, subject, status, created_at, updated_at')
    .eq('id', ticketId)
    .maybeSingle();

  if (!ticket) return null;

  const { data: messages } = await supabase
    .from('support_ticket_messages')
    .select('id, sender_id, message, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  return {
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
    },
    messages: (messages ?? []).map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      senderIsMe: row.sender_id === profile.id,
      message: row.message,
      createdAt: row.created_at,
    })),
  };
};

export type ReplyResult = { success: true } | { success: false; error: string };

export const replyToTicketAction = async (input: ReplyToTicketInput): Promise<ReplyResult> => {
  const profile = await requireUser();
  const parsed = replyToTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('support_ticket_messages').insert({
    ticket_id: parsed.data.ticketId,
    sender_id: profile.id,
    message: parsed.data.message,
  });

  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true };
};

// ── Staff (Operator/Manager) inbox ──────────────────────────────────────────
// support_tickets_select's RLS already returns every ticket for is_staff()
// callers, not just the caller's own — that's what makes this "all
// tickets" rather than requiring a separate admin query path.
export const listAllTicketsAction = async (): Promise<(TicketSummary & { customerName: string })[]> => {
  await requireRole('operator', 'manager');
  const supabase = await createClient();

  const { data } = await supabase
    .from('support_tickets')
    .select('id, subject, status, created_at, updated_at, profiles!profile_id(full_name)')
    .order('updated_at', { ascending: false });

  return (data ?? []).map((row) => {
    const customer = row.profiles as unknown as { full_name: string } | null;
    return {
      id: row.id,
      subject: row.subject,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      customerName: customer?.full_name ?? 'Customer',
    };
  });
};

export type UpdateTicketStatusInput = { ticketId: string; status: 'open' | 'in_progress' | 'resolved' | 'closed' };

export const updateTicketStatusAction = async (input: UpdateTicketStatusInput): Promise<ReplyResult> => {
  const profile = await requireRole('operator', 'manager');
  const supabase = await createClient();

  const { error } = await supabase
    .from('support_tickets')
    .update({ status: input.status, assigned_to: profile.id })
    .eq('id', input.ticketId);

  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true };
};
