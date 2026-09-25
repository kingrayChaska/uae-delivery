import { notFound } from 'next/navigation';

import ReplyForm from '@/components/support/reply-form';
import TicketStatusSelect from '@/components/operator/ticket-status-select';
import { getTicketAction } from '@/lib/support/actions';

import type { StaffDetailViewProps } from '@/components/staff-views/types';

const SupportTicketView = async ({ id }: StaffDetailViewProps) => {

  const detail = await getTicketAction(id);
  if (!detail) notFound();

  const { ticket, messages } = detail;

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
        <TicketStatusSelect ticketId={ticket.id} status={ticket.status} />
      </div>

      <div className="flex flex-col gap-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-lg rounded-md border p-3 text-sm ${
              message.senderIsMe ? 'self-end bg-secondary/50' : 'self-start'
            }`}
          >
            <p>{message.message}</p>
            <p className="mt-1 font-brand-mono text-xs text-muted-foreground">
              {new Date(message.createdAt).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <ReplyForm ticketId={ticket.id} />
    </main>
  );
};

export default SupportTicketView;
