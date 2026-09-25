import CreateStaffForm from '@/components/manager/create-staff-form';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const NewOperatorPage = async () => {
  await requireRoleOrRedirect('manager');

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Add an operator</h1>
      <CreateStaffForm role="operator" />
    </main>
  );
};

export default NewOperatorPage;
