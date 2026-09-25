import ProfileForm from '@/components/dashboard/profile-form';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ProfilePage = async () => {
  const profile = await requireRoleOrRedirect('customer');

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <ProfileForm email={profile.email} defaultValues={{ fullName: profile.fullName, phone: profile.phone }} />
    </main>
  );
};

export default ProfilePage;
