import CreateStaffForm from '@/components/manager/create-staff-form';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const NewDriverPage = async () => {
  await requireRoleOrRedirect('manager');

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Add a driver</h1>
      <CreateStaffForm role="driver" />
    </main>
  );
};

export default NewDriverPage;
