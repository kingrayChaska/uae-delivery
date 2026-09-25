import { z } from '@/lib/zod';

export const createTicketSchema = z.object({
  subject: z.string().min(3, 'Enter a subject'),
  message: z.string().min(1, 'Enter a message'),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const replyToTicketSchema = z.object({
  ticketId: z.string().uuid(),
  message: z.string().min(1, 'Enter a message'),
});

export type ReplyToTicketInput = z.infer<typeof replyToTicketSchema>;
