import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import Pagination from '@/components/dashboard/pagination';
import { listCustomers } from '@/services/customers/list-customers';

import type { StaffListViewProps } from '@/components/staff-views/types';

const CustomersView = async ({ basePath, page }: StaffListViewProps) => {
  const customers = await listCustomers(page);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Customers</h1>

      {customers.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No customers yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {customers.items.map((customer) => (
            <Link key={customer.id} href={`${basePath}/customers/${customer.id}`}>
              <Card className="hover:bg-secondary/40">
                <CardContent className="flex items-center justify-between gap-4 pt-6 text-sm">
                  <div>
                    <p className="font-medium">{customer.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.email} · {customer.phone}
                    </p>
                  </div>
                  <div className="text-right font-brand-mono text-xs">
                    <p>{customer.shipmentCount} shipments</p>
                    <p className="text-muted-foreground">AED {customer.totalSpent.toFixed(2)} paid</p>
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
