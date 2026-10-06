import Link from 'next/link';
import { CircleAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Pagination from '@/components/dashboard/pagination';
import CustomerSearch from '@/components/staff-views/customer-search';
import { listCustomers } from '@/services/customers/list-customers';
import { getFormat } from '@/i18n/server';

import type { StaffListViewProps } from '@/components/staff-views/types';

// Every customer, or those whose name or merchant company matches ?q=
// (searched in the database, one page at a time).
const CustomersView = async ({ basePath, page, query = null }: StaffListViewProps & { query?: string | null }) => {
  const [t, format] = await Promise.all([getTranslations('operator.customers'), getFormat()]);
  const customers = await listCustomers(page, query).catch((error: unknown) => {
    console.error('Customer list failed', error instanceof Error ? error.message : error);
    return null;
  });
  const listHref = query ? `${basePath}/customers?q=${encodeURIComponent(query)}` : `${basePath}/customers`;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <CustomerSearch initialQuery={query ?? ''} />

      {customers === null ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {t('loadError')}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={listHref}>{t('retry')}</Link>
          </Button>
        </div>
      ) : (
        <>
          {query ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t('results', { count: customers.total, query })}
            </p>
          ) : null}

          {customers.items.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="font-medium">{query ? t('noResults', { query }) : t('empty')}</p>
              {query ? <p className="mt-1 text-sm text-muted-foreground">{t('noResultsHint')}</p> : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {customers.items.map((customer) => (
                <Link
                  key={customer.id}
                  href={`${basePath}/customers/${customer.id}`}
                  className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Card className="hover:bg-secondary/40">
                    <CardContent className="flex flex-col gap-3 pt-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          <span className="wrap-break-word">{customer.fullName}</span>
                          {customer.accountType === 'merchant' ? (
                            <Badge variant="secondary">{t('accountType.merchant')}</Badge>
                          ) : null}
                          {!customer.active ? <Badge variant="outline">{t('inactive')}</Badge> : null}
                        </p>
                        {customer.companyName ? (
                          <p className="truncate text-sm">{customer.companyName}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground wrap-anywhere">
                          <span dir="ltr">{customer.email}</span> · <span dir="ltr">{customer.phone}</span>
                        </p>
                      </div>
                      <div className="shrink-0 font-brand-mono text-xs sm:text-end">
                        <p>{t('shipments', { count: customer.shipmentCount })}</p>
                        <p className="text-muted-foreground">{t('paid', { amount: format.money(customer.totalSpent) })}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          <Pagination page={customers.page} totalPages={customers.totalPages} href={listHref} />
        </>
      )}
    </main>
  );
};

export default CustomersView;
