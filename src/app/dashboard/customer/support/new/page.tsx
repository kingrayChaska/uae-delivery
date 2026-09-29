import NewTicketForm from '@/components/support/new-ticket-form';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

// ?subject=&message= pre-fill the form — e.g. "Contact ParcelLink" from the
// booking form for a delivery that's available on request. Only ever used
// as editable text in the form; the customer still reviews and sends it.
const prefill = (value: string | string[] | undefined, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

const NewTicketPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string | string[]; message?: string | string[] }>;
}) => {
  await requireRoleOrRedirect('customer');
  const params = await searchParams;

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">New Support Ticket</h1>
      <NewTicketForm defaultSubject={prefill(params.subject, 200)} defaultMessage={prefill(params.message, 2000)} />
    </main>
  );
};

export default NewTicketPage;
