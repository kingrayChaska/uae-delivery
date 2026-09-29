import { z } from '@/lib/zod';

export const createTicketSchema = z.object({
  subject: z.string().min(3, 'support.validation.subject'),
  message: z.string().min(1, 'support.validation.message'),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const replyToTicketSchema = z.object({
  ticketId: z.string().uuid(),
  message: z.string().min(1, 'support.validation.message'),
});

export type ReplyToTicketInput = z.infer<typeof replyToTicketSchema>;
