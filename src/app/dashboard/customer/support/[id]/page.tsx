import { notFound } from 'next/navigation';

import ReplyForm from '@/components/support/reply-form';
import TicketStatusBadge from '@/components/support/ticket-status-badge';
import TicketThread from '@/components/support/ticket-thread';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getTicketAction } from '@/lib/support/actions';

const TicketDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('customer');
  const { id } = await params;

  const detail = await getTicketAction(id);
  if (!detail) notFound();

  const { ticket, messages } = detail;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
        <TicketStatusBadge status={ticket.status} />
      </div>

      <TicketThread messages={messages} />

      <ReplyForm ticketId={ticket.id} />
    </main>
  );
};

export default TicketDetailPage;
