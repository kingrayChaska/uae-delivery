import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import BatchList from '@/components/bulk/batch-list';
import Pagination from '@/components/dashboard/pagination';
import BulkUploadCard from '@/components/bulk/merchant/bulk-upload-card';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { todayInUae } from '@/lib/bulk/schemas';
import { listBatches } from '@/services/bulk/list-batches';

import type { Metadata } from 'next';
import type { PageSearchParams } from '@/lib/pagination';

// Uploading stores every row; give it room on large files.
export const maxDuration = 60;

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('bulk.page'))('meta'),
});

// Merchant Bulk Shipments: upload a CSV (stage 1) and the history of
// uploads and multi-shipment bookings. Merchants only — the account type
// comes from the database, and every action checks it again.
const MerchantBulkPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  const profile = await requireRoleOrRedirect('customer');
  if (profile.accountType !== 'merchant') redirect('/dashboard/customer/merchant');

  const [{ page }, t] = await Promise.all([searchParams, getTranslations('bulk.page')]);
  // RLS limits this to the merchant's own (and their business's) batches.
  const batches = await listBatches(parsePage(page), ['draft', 'processing', 'submitted', 'partially_failed', 'failed']);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="max-w-3xl text-muted-foreground">{t('subtitle')}</p>
      </div>

      <BulkUploadCard today={todayInUae()} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('history')}</h2>
        <BatchList batches={batches.items} hrefBase="/dashboard/customer/bulk" emptyMessage={t('historyEmpty')} />
        <Pagination page={batches.page} totalPages={batches.totalPages} href="/dashboard/customer/bulk" />
      </section>
    </main>
  );
};

export default MerchantBulkPage;
