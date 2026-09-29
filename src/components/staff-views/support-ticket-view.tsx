import { notFound } from 'next/navigation';

import ReplyForm from '@/components/support/reply-form';
import TicketThread from '@/components/support/ticket-thread';
import TicketStatusSelect from '@/components/operator/ticket-status-select';
import { getTicketAction } from '@/lib/support/actions';

import type { StaffDetailViewProps } from '@/components/staff-views/types';

const SupportTicketView = async ({ id }: StaffDetailViewProps) => {
  const detail = await getTicketAction(id);
  if (!detail) notFound();

  const { ticket, messages } = detail;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
        <TicketStatusSelect ticketId={ticket.id} status={ticket.status} />
      </div>

      <TicketThread messages={messages} />

      <ReplyForm ticketId={ticket.id} />
    </main>
  );
};

export default SupportTicketView;
