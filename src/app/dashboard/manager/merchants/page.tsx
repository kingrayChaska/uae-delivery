import Link from 'next/link';
import { Building2, ChevronRight } from 'lucide-react';

import Pagination from '@/components/dashboard/pagination';
import MerchantStatusBadge from '@/components/merchant/merchant-status-badge';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { MERCHANT_STATUS_COPY } from '@/lib/merchant/schemas';
import { countMerchantApplicationsByStatus, listMerchantApplications } from '@/services/merchant/applications';
import { MERCHANT_STATUSES } from '@/lib/types';

import type { Metadata } from 'next';
import type { MerchantStatus } from '@/lib/types';

export const metadata: Metadata = { title: 'Merchant applications · ParcelLink' };

const FILTERS: (MerchantStatus | 'all')[] = ['pending', 'requires_changes', 'approved', 'rejected', 'all'];

const MerchantApplicationsPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string | string[] }>;
}) => {
  await requireRoleOrRedirect('manager');
  const params = await searchParams;
  const status = (MERCHANT_STATUSES as readonly string[]).includes(params.status ?? '')
    ? (params.status as MerchantStatus)
    : params.status === 'all'
      ? 'all'
      : 'pending';
  const [applications, counts] = await Promise.all([
    listMerchantApplications(status, parsePage(params.page)),
    countMerchantApplicationsByStatus(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Merchant applications</h1>
        <p className="text-sm text-muted-foreground">Review companies applying for merchant pricing and tools.</p>
      </div>

      <nav aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {FILTERS.map((filter) => {
          const active = filter === status;
          const count = filter === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[filter];
          return (
            <Link
              key={filter}
              href={`/dashboard/manager/merchants?status=${filter}`}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${
                active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary/60'
              }`}
            >
              {filter === 'all' ? 'All' : MERCHANT_STATUS_COPY[filter].label}
              <span className={`rounded-full px-1.5 font-brand-mono text-xs ${active ? 'bg-primary-foreground/20' : 'bg-secondary'}`}>
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {applications.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
          <Building2 className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">No applications here</p>
          <p className="text-sm text-muted-foreground">
            {status === 'pending' ? 'You’re all caught up — new applications will appear here.' : 'Nothing matches this filter.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {applications.items.map((application) => (
            <li key={application.id}>
              <Link
                href={`/dashboard/manager/merchants/${application.id}`}
                className="flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary sm:flex">
                  <Building2 className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{application.companyName}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {application.applicantName} · {application.city} · {application.monthlyShipmentVolume} shipments/month
                  </span>
                </span>
                <span className="hidden text-right text-xs text-muted-foreground md:block">
                  Submitted
                  <br />
                  {new Date(application.submittedAt).toLocaleDateString('en-AE', { timeZone: 'Asia/Dubai' })}
                </span>
                <MerchantStatusBadge status={application.status} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={applications.page} totalPages={applications.totalPages} href={`/dashboard/manager/merchants?status=${status}`} />
    </main>
  );
};

export default MerchantApplicationsPage;
