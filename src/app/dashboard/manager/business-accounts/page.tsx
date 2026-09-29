import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listBusinessAccounts } from '@/services/business/business-accounts';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('manager.business'))('meta'),
});

const BusinessAccountsPage = async () => {
  await requireRoleOrRedirect('manager');
  const [accounts, t, tStaff] = await Promise.all([
    listBusinessAccounts(),
    getTranslations('manager.business'),
    getTranslations('manager.staff'),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Button asChild>
          <Link href="/dashboard/manager/business-accounts/new">{t('new')}</Link>
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('emptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map((account) => (
            <Link key={account.id} href={`/dashboard/manager/business-accounts/${account.id}`}>
              <Card className="h-full hover:bg-secondary/40">
                <CardContent className="flex flex-col gap-2 pt-6 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{account.companyName}</p>
                    <Badge variant={account.active ? 'success' : 'secondary'}>{account.active ? tStaff('active') : tStaff('inactive')}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    {account.contactPerson} · <span dir="ltr">{account.contactEmail}</span>
                  </p>
                  <p className="font-brand-mono text-xs">
                    {t('counts', { members: account.memberCount, shipments: account.shipmentCount })}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
};

export default BusinessAccountsPage;
