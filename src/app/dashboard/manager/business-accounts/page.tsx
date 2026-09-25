import Link from 'next/link';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listBusinessAccounts } from '@/services/business/business-accounts';

const BusinessAccountsPage = async () => {
  await requireRoleOrRedirect('manager');
  const accounts = await listBusinessAccounts();

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Business Accounts</h1>
        <Button asChild>
          <Link href="/dashboard/manager/business-accounts/new">New business account</Link>
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No business accounts yet</p>
          <p className="text-sm text-muted-foreground">Business accounts group customers, billing and bulk shipments.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map((account) => (
            <Link key={account.id} href={`/dashboard/manager/business-accounts/${account.id}`}>
              <Card className="h-full hover:bg-secondary/40">
                <CardContent className="flex flex-col gap-2 pt-6 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{account.companyName}</p>
                    <Badge variant={account.active ? 'success' : 'secondary'}>{account.active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    {account.contactPerson} · {account.contactEmail}
                  </p>
                  <p className="font-brand-mono text-xs">
                    {account.memberCount} members · {account.shipmentCount} shipments
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
