import ProfileForm from '@/components/dashboard/profile-form';
import DriverDetailsCard from '@/components/driver/driver-details-card';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getDriverProfileDetail } from '@/services/drivers/get-driver-profile';

const DriverProfilePage = async () => {
  const profile = await requireRoleOrRedirect('driver');
  const detail = await getDriverProfileDetail(profile.id);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      {detail ? <DriverDetailsCard detail={detail} /> : null}
      <ProfileForm email={profile.email} defaultValues={{ fullName: profile.fullName, phone: profile.phone }} />
    </main>
  );
};

export default DriverProfilePage;
