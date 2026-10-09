import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

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
import { getFormat } from '@/i18n/server';

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

  const [t, tStaff, format] = await Promise.all([
    getTranslations('manager.business'),
    getTranslations('manager.staff'),
    getFormat(),
  ]);
  const { account, members, shipments, totals } = detail;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{account.companyName}</h1>
          <p className="text-sm text-muted-foreground">
            {account.contactPerson} · <span dir="ltr">{account.contactEmail}</span> ·{' '}
            <span dir="ltr">{account.contactPhone}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={account.active ? 'success' : 'secondary'}>{account.active ? tStaff('active') : tStaff('inactive')}</Badge>
          <BusinessActiveToggle businessId={account.id} active={account.active} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('stats.shipments')} value={format.number(account.shipmentCount)} />
        <StatCard label={t('stats.billed')} value={format.money(totals.billed)} />
        <StatCard label={t('stats.outstanding')} value={format.money(totals.outstanding)} />
        <StatCard label={t('stats.cod')} value={format.money(totals.cod)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="text-sm font-medium">{t('details')}</p>
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
            <p className="text-sm font-medium">{t('members')}</p>
            <BusinessMembers businessId={account.id} members={members} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <p className="text-sm font-medium">{t('bulkUpload')}</p>
          {account.active ? (
            <BulkUpload businessId={account.id} members={members} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('reactivateToUpload')}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">{t('history')}</h2>
        {shipments.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noShipments')}</p>
        ) : (
          shipments.items.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath="/dashboard/manager/shipments" showRecipientName />
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
