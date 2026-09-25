import NewTicketForm from '@/components/support/new-ticket-form';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const NewTicketPage = async () => {
  await requireRoleOrRedirect('customer');

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">New Support Ticket</h1>
      <NewTicketForm />
    </main>
  );
};

export default NewTicketPage;
