import Link from 'next/link';

import BulkListForm from '@/components/bulk/bulk-list-form';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listMyBusinessAccounts } from '@/services/business/business-accounts';

// Submitting routes and prices every shipment in the list server-side
// (several Mapbox calls per row), which can outlast the default limit.
export const maxDuration = 60;

const NewBulkListPage = async () => {
  const profile = await requireRoleOrRedirect('customer');
  const businesses = await listMyBusinessAccounts(profile.id);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Link href="/dashboard/customer/bulk" className="text-sm text-muted-foreground hover:underline">
          ← Bulk Shipments
        </Link>
        <h1 className="text-2xl font-semibold">New bulk list</h1>
        <p className="text-muted-foreground">
          Add every parcel you&apos;re sending. Once submitted, the whole list goes straight to our operations team.
        </p>
      </div>
      <BulkListForm businesses={businesses} />
    </main>
  );
};

export default NewBulkListPage;
