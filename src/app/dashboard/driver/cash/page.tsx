import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/stat-card';
import RemittanceSubmitForm from '@/components/cash/remittance-submit-form';
import RemittanceTable from '@/components/cash/remittance-table';
import CashWeeksTable from '@/components/cash/cash-weeks-table';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { addAed, parseRemittanceView } from '@/lib/cash/remittances';
import { getDriverCashOverview, listDriverCashWeeks, listDriverRemittanceHistory } from '@/services/cash/remittances';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';
import type { RemittanceView } from '@/lib/cash/remittances';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('cash.driver'))('meta'),
});

type SearchParams = Promise<{ view?: string | string[]; page?: string | string[] }>;

const PATH = '/dashboard/driver/cash';

// The driver's cash: what they collected this week (COD and delivery fees
// apart), what they've handed over, what an operator has confirmed, and
// what they still hold. Only an operator's confirmation reduces it.
const DriverCashPage = async ({ searchParams }: { searchParams: SearchParams }) => {
  await requireRoleOrRedirect('driver');
  const params = await searchParams;
  const view = parseRemittanceView(params.view);
  const page = parsePage(params.page);
  const [t, format, data] = await Promise.all([
    getTranslations('cash.driver'),
    getFormat(),
    Promise.all([getDriverCashOverview(), listDriverCashWeeks(undefined, 8), listDriverRemittanceHistory(view, page)]).catch(
      (error: unknown) => {
        console.error('Driver cash overview failed', error);
        return null;
      },
    ),
  ]);
  const aed = (amount: number) => format.money(amount);
  const href = ({ view: next, page: nextPage }: { view: RemittanceView; page?: number }) => {
    const query = new URLSearchParams();
    if (next !== 'all') query.set('view', next);
    if (nextPage && nextPage > 1) query.set('page', String(nextPage));
    const qs = query.toString();
    return qs ? `${PATH}?${qs}` : PATH;
  };

  if (!data || !data[0]) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <div className="rounded-md border border-destructive/40 p-6 text-center" role="alert">
          <p className="font-medium">{t('loadFailed')}</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={PATH}>{t('retry')}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const [overview, weeks, history] = data;
  const weekCollected = addAed(overview.week.collectedCod, overview.week.collectedFee);
  const pending = addAed(overview.pendingCod, overview.pendingFee, overview.pendingUnclassified);
  const period = t('period', {
    from: format.date(`${overview.weekStart}T00:00:00+04:00`),
    to: format.date(`${overview.weekEnd}T00:00:00+04:00`),
  });

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('intro')}</p>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="driver-week">
        <h2 id="driver-week" className="text-lg font-medium">
          {t('weekHeading', { period })}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('cards.feesCollected')} value={aed(overview.week.collectedFee)} />
          <StatCard label={t('cards.codCollected')} value={aed(overview.week.collectedCod)} />
          <StatCard label={t('cards.otherCollected')} value={aed(0)} />
          <StatCard label={t('cards.totalCollected')} value={aed(weekCollected)} />
        </div>
        <p className="text-xs text-muted-foreground">{t('cards.weekNote')}</p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="driver-now">
        <h2 id="driver-now" className="text-lg font-medium">
          {t('nowHeading')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label={t('cards.submitted')} value={aed(pending)} />
          <StatCard label={t('cards.confirmedWeek')} value={aed(overview.week.confirmed)} />
          <StatCard label={t('cards.outstanding')} value={aed(overview.outstanding)} />
        </div>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          <li>{t('outstandingSplit', { cod: aed(overview.outstandingCod), fee: aed(overview.outstandingFee) })}</li>
          {overview.openingOutstanding > 0 ? <li>{t('carried', { amount: aed(overview.openingOutstanding) })}</li> : null}
          {overview.pendingCount > 0 ? <li>{t('pendingNote', { count: overview.pendingCount, amount: aed(pending) })}</li> : null}
          {overview.disputedCount > 0 ? <li className="text-destructive">{t('disputedNote', { count: overview.disputedCount })}</li> : null}
          {overview.confirmedUnclassified > 0 ? <li>{t('unclassifiedNote', { amount: aed(overview.confirmedUnclassified) })}</li> : null}
          {overview.expected > 0 ? <li>{t('expectedNote', { amount: aed(overview.expected) })}</li> : null}
          {overview.unverified > 0 ? <li>{t('unverifiedNote', { amount: aed(overview.unverified) })}</li> : null}
        </ul>
      </section>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <h2 className="text-lg font-medium">{t('submitHeading')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('availableLine', { cod: aed(overview.availableCod), fee: aed(overview.availableFee) })}
          </p>
          <RemittanceSubmitForm kind="driver" availableCod={overview.availableCod} availableFee={overview.availableFee} />
        </CardContent>
      </Card>

      <CashWeeksTable id="driver-weeks" title={t('weeksHeading')} weeks={weeks} />

      <RemittanceTable id="driver-history" title={t('historyHeading')} entries={history} view={view} href={href} empty={t('historyEmpty')} />
    </main>
  );
};

export default DriverCashPage;
