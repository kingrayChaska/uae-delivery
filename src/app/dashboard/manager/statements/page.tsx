import { getTranslations } from 'next-intl/server';
import { CircleAlert } from 'lucide-react';

import Button from '@/components/ui/button';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import Pagination from '@/components/dashboard/pagination';
import FinancialRatesCard from '@/components/finance/financial-rates-card';
import StatementGenerateForm from '@/components/finance/statement-generate-form';
import StatementTable from '@/components/finance/statement-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { failedLoad } from '@/lib/finance/load-error';
import { STATEMENT_STATUSES } from '@/lib/finance/statements';
import { todayInDubai } from '@/lib/finance/schemas';
import { parsePage } from '@/lib/pagination';
import { isUuid } from '@/lib/security/validate';
import { listFinancialRates } from '@/services/finance/rates';
import { STATEMENT_PAGE_SIZE, listStatementMerchants, listStatements } from '@/services/finance/statements';

import type { Metadata } from 'next';
import type { StatementStatus } from '@/lib/finance/statements';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('finance.statements'))('meta'),
});

type SearchParams = Promise<{ merchant?: string; status?: string; page?: string }>;

// Merchant Account Reports: generate a draft statement for one merchant and
// period, and every statement generated so far. Managers only (the layout,
// RLS, and each database function check it).
const ManagerStatementsPage = async ({ searchParams }: { searchParams: SearchParams }) => {
  await requireRoleOrRedirect('manager');
  const params = await searchParams;
  const merchant = isUuid(params.merchant) ? params.merchant : null;
  const status = (STATEMENT_STATUSES as readonly string[]).includes(params.status ?? '') ? (params.status as StatementStatus) : null;
  const page = parsePage(params.page);

  const [t, tRates, merchants, list, rates] = await Promise.all([
    getTranslations('finance.statements'),
    getTranslations('finance.rates'),
    listStatementMerchants().catch(failedLoad('Statement merchants')),
    listStatements({ businessAccountId: merchant, status, page }).catch(failedLoad('Statements')),
    listFinancialRates().catch(failedLoad('Statement rates')),
  ]);

  const filterQuery = new URLSearchParams();
  if (merchant) filterQuery.set('merchant', merchant);
  if (status) filterQuery.set('status', status);
  const listHref = `/dashboard/manager/statements${filterQuery.size ? `?${filterQuery}` : ''}`;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('generate.heading')}</CardTitle>
          <CardDescription>{t('generate.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {merchants ? (
            <StatementGenerateForm merchants={merchants} today={todayInDubai()} defaultMerchantId={merchant} />
          ) : (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <CircleAlert className="size-4" aria-hidden />
              {t('loadFailed')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tRates('heading')}</CardTitle>
          <CardDescription>{tRates('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {rates ? (
            <FinancialRatesCard rates={rates} today={todayInDubai()} />
          ) : (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <CircleAlert className="size-4" aria-hidden />
              {t('loadFailed')}
            </p>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="statements-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="statements-heading" className="text-lg font-medium">
            {t('list.heading')}
          </h2>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="filter-merchant">{t('list.merchant')}</Label>
              <Select id="filter-merchant" name="merchant" defaultValue={merchant ?? ''} className="w-56">
                <option value="">{t('list.allMerchants')}</option>
                {(merchants ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="filter-status">{t('list.status')}</Label>
              <Select id="filter-status" name="status" defaultValue={status ?? ''} className="w-40">
                <option value="">{t('list.allStatuses')}</option>
                {STATEMENT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`status.${value}`)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="outline">
              {t('list.apply')}
            </Button>
          </form>
        </div>

        {!list ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <CircleAlert className="size-4" aria-hidden />
            {t('loadFailed')}
          </p>
        ) : list.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {merchant || status ? t('list.emptyFiltered') : t('list.empty')}
          </p>
        ) : (
          <>
            <StatementTable rows={list.rows} href={(id) => `/dashboard/manager/statements/${id}`} showMerchant />
            <Pagination page={page} totalPages={Math.max(1, Math.ceil(list.total / STATEMENT_PAGE_SIZE))} href={listHref} />
          </>
        )}
      </section>
    </main>
  );
};

export default ManagerStatementsPage;
