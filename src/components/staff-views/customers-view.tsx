import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import Pagination from '@/components/dashboard/pagination';
import { listCustomers } from '@/services/customers/list-customers';
import { getFormat } from '@/i18n/server';

import type { StaffListViewProps } from '@/components/staff-views/types';

const CustomersView = async ({ basePath, page }: StaffListViewProps) => {
  const [customers, t, format] = await Promise.all([listCustomers(page), getTranslations('operator.customers'), getFormat()]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {customers.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {customers.items.map((customer) => (
            <Link key={customer.id} href={`${basePath}/customers/${customer.id}`}>
              <Card className="hover:bg-secondary/40">
                <CardContent className="flex items-center justify-between gap-4 pt-6 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{customer.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      <span dir="ltr">{customer.email}</span> · <span dir="ltr">{customer.phone}</span>
                    </p>
                  </div>
                  <div className="text-end font-brand-mono text-xs">
                    <p>{t('shipments', { count: customer.shipmentCount })}</p>
                    <p className="text-muted-foreground">{t('paid', { amount: format.money(customer.totalSpent) })}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Pagination page={customers.page} totalPages={customers.totalPages} href={`${basePath}/customers`} />
    </main>
  );
};

export default CustomersView;
