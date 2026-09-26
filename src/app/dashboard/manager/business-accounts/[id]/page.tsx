import { notFound } from 'next/navigation';

import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/stat-card';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import BusinessForm from '@/components/manager/business-form';
import BusinessMembers from '@/components/manager/business-members';
import BusinessActiveToggle from '@/components/manager/business-active-toggle';
import BulkUpload from '@/components/manager/bulk-upload';
import Pagination from '@/components/dashboard/pagination';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { getBusinessAccountDetail } from '@/services/business/business-accounts';

import type { PageSearchParams } from '@/lib/pagination';

const BusinessAccountDetailPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: PageSearchParams;
}) => {
  await requireRoleOrRedirect('manager');
  const [{ id }, { page }] = await Promise.all([params, searchParams]);

  const detail = await getBusinessAccountDetail(id, parsePage(page));
  if (!detail) notFound();

  const { account, members, shipments, totals } = detail;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{account.companyName}</h1>
          <p className="text-sm text-muted-foreground">
            {account.contactPerson} · {account.contactEmail} · {account.contactPhone}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={account.active ? 'success' : 'secondary'}>{account.active ? 'Active' : 'Inactive'}</Badge>
          <BusinessActiveToggle businessId={account.id} active={account.active} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Shipments" value={String(account.shipmentCount)} />
        <StatCard label="Billed" value={`AED ${totals.billed.toFixed(2)}`} />
        <StatCard label="Outstanding" value={`AED ${totals.outstanding.toFixed(2)}`} />
        <StatCard label="COD" value={`AED ${totals.cod.toFixed(2)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="text-sm font-medium">Account details</p>
            <BusinessForm
              businessId={account.id}
              defaultValues={{
                companyName: account.companyName,
                contactPerson: account.contactPerson,
                contactEmail: account.contactEmail,
                contactPhone: account.contactPhone,
                billingAddress: account.billingAddress,
                trn: account.trn,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="text-sm font-medium">Members</p>
            <BusinessMembers businessId={account.id} members={members} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <p className="text-sm font-medium">Bulk shipment upload</p>
          {account.active ? (
            <BulkUpload businessId={account.id} members={members} />
          ) : (
            <p className="text-sm text-muted-foreground">Reactivate this account to upload shipments.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Shipment history</h2>
        {shipments.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shipments under this account yet.</p>
        ) : (
          shipments.items.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath="/dashboard/manager/shipments" />
          ))
        )}
        <Pagination
          page={shipments.page}
          totalPages={shipments.totalPages}
          href={`/dashboard/manager/business-accounts/${account.id}`}
        />
      </div>
    </main>
  );
};

export default BusinessAccountDetailPage;
